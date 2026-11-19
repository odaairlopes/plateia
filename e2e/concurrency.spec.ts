import { expect, test, type Page } from '@playwright/test';
import { conflictNotice, freeSeats, holdTimer, newVisitor, openSeatMap, reserve, seat } from './support';

/** Gives the hold back, so a test never leaves seats held for the next one. */
async function releaseHold(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Alterar assentos' }).click();
  await expect(holdTimer(page)).toBeHidden();
}

test.describe('dois visitantes ao mesmo tempo', () => {
  test('o mapa mostra ao vivo, sem recarregar, o assento que outra pessoa reservou', async ({ browser }, testInfo) => {
    const alice = await newVisitor(browser, testInfo);
    const bob = await newVisitor(browser, testInfo);
    await openSeatMap(alice.page);
    await openSeatMap(bob.page);

    const [position = ''] = await freeSeats(alice.page, 1);
    await seat(alice.page, position).click();
    await reserve(alice.page);
    await expect(holdTimer(alice.page)).toBeVisible();

    // Bob never reloads: the change reaches him over Server-Sent Events.
    await expect(seat(bob.page, position)).toHaveAttribute('data-status', 'held');
    await expect(seat(bob.page, position)).toHaveAccessibleName(/reservado por outra pessoa/);
    await expect(seat(bob.page, position)).toHaveAttribute('aria-disabled', 'true');

    await releaseHold(alice.page);
    await expect(seat(bob.page, position)).toHaveAttribute('data-status', 'available');

    await alice.context.close();
    await bob.context.close();
  });

  test('na disputa pelo mesmo assento, só um visitante leva a reserva', async ({ browser }, testInfo) => {
    const visitors = [await newVisitor(browser, testInfo), await newVisitor(browser, testInfo)];
    // Live updates are cut on purpose: neither browser may learn about the other's
    // hold before clicking, so both requests really reach the server and race there.
    for (const { context } of visitors) {
      await context.route('**/seats/stream', (route) => route.abort());
    }
    const pages = visitors.map((visitor) => visitor.page);
    for (const page of pages) await openSeatMap(page);

    const [position = ''] = await freeSeats(pages[0]!, 1);
    for (const page of pages) {
      await seat(page, position).click();
      await expect(seat(page, position)).toHaveAttribute('aria-pressed', 'true');
    }

    await Promise.all(pages.map((page) => reserve(page)));

    // Each page ends up in exactly one of the two outcomes...
    const outcomes = await Promise.all(
      pages.map(async (page) => {
        await expect(holdTimer(page).or(conflictNotice(page))).toBeVisible();
        return (await holdTimer(page).isVisible()) ? 'won' : 'lost';
      }),
    );
    // ...and exactly one of them got the seat.
    expect(outcomes.toSorted()).toEqual(['lost', 'won']);

    const winner = pages[outcomes.indexOf('won')]!;
    const loser = pages[outcomes.indexOf('lost')]!;
    // The loser's map was refreshed after the conflict and its selection dropped the seat.
    await expect(seat(loser, position)).toHaveAttribute('data-status', 'held');
    await expect(loser.getByRole('button', { name: 'Reservar assentos' })).toBeDisabled();

    await releaseHold(winner);
    for (const { context } of visitors) await context.close();
  });
});
