import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { getPlatformSettings } from './config';

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;
/** Anything that can run a query: the pool, or a client inside a transaction. */
export type Queryable = Pick<pg.Pool, 'query'>;

const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;

/** Schema names are interpolated into SQL, so only plain identifiers are accepted. */
export function assertSchemaName(schema: string): string {
  if (!SCHEMA_NAME.test(schema)) throw new Error(`Invalid schema name: ${schema}`);
  return schema;
}

export function createPool(connectionString: string): Pool {
  return new pg.Pool({ connectionString, max: getPlatformSettings().DB_POOL_MAX, idleTimeoutMillis: 30_000 });
}

export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Minimal forward-only migration runner: applies the `.sql` files of `directory`
 * in name order, once each. An advisory lock makes concurrent replicas safe.
 * Each service owns one schema — the "database per service" boundary.
 */
export async function runMigrations(pool: Pool, schemaName: string, directory: string): Promise<string[]> {
  const schema = assertSchemaName(schemaName);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).toSorted();
  const applied: string[] = [];

  await withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`migrations:${schema}`]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${schema}.schema_migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await client.query<{ name: string }>(`SELECT name FROM ${schema}.schema_migrations`);
    const done = new Set(rows.map((row) => row.name));

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(directory, file), 'utf8');
      await client.query(sql);
      await client.query(`INSERT INTO ${schema}.schema_migrations (name) VALUES ($1)`, [file]);
      applied.push(file);
    }
  });

  return applied;
}
