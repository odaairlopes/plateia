import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  dashboardQuerySchema,
  dashboardSchema,
  loginRequestSchema,
  organizerSchema,
  problemSchema,
  type Dashboard,
  type DashboardQuery,
  type Organizer,
} from '@plateia/contracts';
import { DomainError, type App } from '@plateia/platform';

export const SESSION_COOKIE = 'plateia_admin';
const SESSION_SECONDS = 8 * 60 * 60;

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export interface BackofficeRouteDeps {
  login(email: string, password: string): Promise<Organizer>;
  currentOrganizer(organizerId: string): Promise<Organizer>;
  getDashboard(organizerId: string, query: DashboardQuery): Promise<Dashboard>;
  secureCookies: boolean;
}

/** Every protected route runs this first: no valid session cookie, no data. */
async function requireSession(request: FastifyRequest): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw new DomainError('UNAUTHENTICATED', 'Sign in to continue', 401);
  }
}

export function registerBackofficeRoutes(app: App, deps: BackofficeRouteDeps): void {
  const cookieOptions = {
    path: '/',
    httpOnly: true, // unreachable from JavaScript: an XSS cannot steal the session
    sameSite: 'strict' as const, // never sent on cross-site requests: CSRF protection
    secure: deps.secureCookies,
  };

  const clearSession = (reply: FastifyReply) => reply.clearCookie(SESSION_COOKIE, cookieOptions);

  app.post(
    '/auth/login',
    {
      // Brute-force protection on top of the slow password hash.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: 'Sign in as an organizer (sets an httpOnly session cookie)',
        body: loginRequestSchema,
        response: { 200: organizerSchema, 401: problemSchema },
      },
    },
    async (request, reply) => {
      const organizer = await deps.login(request.body.email, request.body.password);
      const token = await reply.jwtSign({ sub: organizer.id }, { expiresIn: SESSION_SECONDS });
      reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS });
      return organizer;
    },
  );

  app.post(
    '/auth/logout',
    { schema: { tags: ['auth'], summary: 'End the session', response: { 204: z.null() } } },
    async (_request, reply) => {
      clearSession(reply);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/auth/me',
    {
      preHandler: requireSession,
      schema: {
        tags: ['auth'],
        summary: 'The signed-in organizer',
        response: { 200: organizerSchema, 401: problemSchema },
      },
    },
    async (request, reply) => {
      try {
        return await deps.currentOrganizer(request.user.sub);
      } catch (error) {
        clearSession(reply);
        throw error;
      }
    },
  );

  app.get(
    '/dashboard',
    {
      preHandler: requireSession,
      schema: {
        tags: ['dashboard'],
        summary: "Sales of the organizer's events",
        querystring: dashboardQuerySchema,
        response: { 200: dashboardSchema, 401: problemSchema, 404: problemSchema },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      return deps.getDashboard(request.user.sub, request.query);
    },
  );
}
