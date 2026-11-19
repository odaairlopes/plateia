import { expect, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from '@playwright/test';

/** Demo event owned by the demo organizer below (seeded by the migrations). */
export const EVENT_ID = 'noite-de-vidro';
export const EVENT_TITLE = /Noite de Vidro/;
export const ORGANIZER = { email: 'ana@aurora.dev', password: process.env.E2E_ADMIN_PASSWORD ?? 'plateia-demo-2026' };
export const OTHER_ORGANIZER_EVENT = /Festival Maresia/;

/**
 * A second, fully isolated visitor: its own cookies and storage, so its own
 * anonymous booking session. Config options (baseURL, locale) are copied over
 * because a context created by hand does not inherit them.
 */
export async function newVisitor(browser: Browser, testInfo: TestInfo): Promise<{ context: BrowserContext; page: Page }> {
  const { baseURL, locale, timezoneId } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, locale, timezoneId });
  return { context, page: await context.newPage() };
}

/** Opens the seat map of an event and waits until the seats are on screen. */
export async function openSeatMap(page: Page, eventId = EVENT_ID): Promise<void> {
  await page.goto(`/events/${eventId}/seats`);
  await expect(page.getByRole('heading', { level: 1, name: 'Escolha seus assentos' })).toBeVisible();
  await expect(seatGrid(page).locator('button').first()).toBeVisible();
}

export const seatGrid = (page: Page): Locator => page.getByRole('group', { name: /Assentos do setor/ });

/** A seat by its position ("row:number") in the visible section. */
export const seat = (page: Page, position: string): Locator => seatGrid(page).locator(`[data-seat="${position}"]`);

/**
 * Positions of the first free seats in the visible section. Seats are picked
 * from what is free right now, so the suite can run again and again against
 * the same database (earlier runs leave seats sold).
 */
export async function freeSeats(page: Page, count: number): Promise<string[]> {
  const free = seatGrid(page).locator('button[data-status="available"]');
  const positions: string[] = [];
  for (let index = 0; index < count; index++) {
    const position = await free.nth(index).getAttribute('data-seat');
    if (!position) throw new Error(`Fewer than ${count} free seats left in the visible section`);
    positions.push(position);
  }
  return positions;
}

export const holdTimer = (page: Page): Locator => page.getByText('Assentos reservados para você por');
export const conflictNotice = (page: Page): Locator => page.getByText(/Alguém acabou de reservar/);

export async function reserve(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Reservar assentos' }).click();
}

export async function checkout(
  page: Page,
  customer: { name: string; email: string },
  scenario: 'approve' | 'decline' = 'approve',
): Promise<void> {
  await page.getByLabel('Nome completo').fill(customer.name);
  await page.getByLabel('E-mail').fill(customer.email);
  if (scenario === 'decline') await page.getByLabel('Recusar pagamento').check();
  await page.getByRole('button', { name: /^Pagar/ }).click();
}

/** A unique address per test run, so nothing matches a previous run. */
export const uniqueEmail = (tag: string): string => `e2e-${tag}-${crypto.randomUUID().slice(0, 8)}@example.com`;
