import type { EventCategory, EventDetail, EventSummary, LocalizedText, Section } from '@plateia/contracts';
import type { Pool } from '@plateia/platform';

interface EventRow {
  id: string;
  title: string;
  category: EventCategory;
  venue: string;
  city: string;
  starts_at: Date;
  cover_hue: number;
  min_price_cents: number;
  description: LocalizedText;
}

interface SectionRow {
  id: string;
  name: LocalizedText;
  price_cents: number;
  rows: number;
  seats_per_row: number;
}

export interface CatalogRepository {
  listEvents(): Promise<EventSummary[]>;
  findEvent(eventId: string): Promise<EventDetail | null>;
}

const EVENT_COLUMNS = `
  e.id, e.title, e.category, e.venue, e.city, e.starts_at, e.cover_hue, e.description,
  COALESCE((SELECT MIN(s.price_cents) FROM catalog.sections s WHERE s.event_id = e.id), 0)::int AS min_price_cents
`;

function toSummary(row: EventRow): EventSummary {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    venue: row.venue,
    city: row.city,
    startsAt: row.starts_at.toISOString(),
    coverHue: row.cover_hue,
    minPriceCents: row.min_price_cents,
  };
}

function toSection(row: SectionRow): Section {
  return {
    id: row.id,
    name: row.name,
    priceCents: row.price_cents,
    rows: row.rows,
    seatsPerRow: row.seats_per_row,
  };
}

export function createCatalogRepository(pool: Pool): CatalogRepository {
  return {
    async listEvents() {
      const { rows } = await pool.query<EventRow>(`SELECT ${EVENT_COLUMNS} FROM catalog.events e ORDER BY e.starts_at`);
      return rows.map(toSummary);
    },

    async findEvent(eventId) {
      const [events, sections] = await Promise.all([
        pool.query<EventRow>(`SELECT ${EVENT_COLUMNS} FROM catalog.events e WHERE e.id = $1`, [eventId]),
        pool.query<SectionRow>(
          `SELECT id, name, price_cents, rows, seats_per_row
             FROM catalog.sections WHERE event_id = $1 ORDER BY position`,
          [eventId],
        ),
      ]);
      const event = events.rows[0];
      if (!event) return null;
      return { ...toSummary(event), description: event.description, sections: sections.rows.map(toSection) };
    },
  };
}
