import { expect, test } from '@playwright/test';
import { openSeatMap, seat, seatGrid } from './support';

test.describe('acessibilidade do mapa de assentos', () => {
  test('o mapa é uma única parada de Tab e as setas percorrem os assentos', async ({ page }) => {
    await openSeatMap(page);

    // Roving tabindex: only one seat of the grid is reachable with Tab.
    await expect(seatGrid(page).locator('button[tabindex="0"]')).toHaveCount(1);

    await seat(page, '1:1').focus();
    await page.keyboard.press('ArrowRight');
    await expect(seat(page, '1:2')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(seat(page, '2:2')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(seat(page, '2:1')).toBeFocused();
    await page.keyboard.press('End');
    const lastSeat = seatGrid(page).locator('[data-seat^="2:"]').last();
    await expect(lastSeat).toBeFocused();
    await expect(lastSeat).toHaveAttribute('tabindex', '0');

    // Every seat states its status in words, never by color alone.
    await expect(seat(page, '1:1')).toHaveAccessibleName(
      /^Fileira A, assento 1, (disponível|selecionado|reservado por outra pessoa|vendido)$/,
    );
  });

  test('o teclado seleciona um assento livre', async ({ page }) => {
    await openSeatMap(page);
    const free = seatGrid(page).locator('button[data-status="available"]').first();
    const position = (await free.getAttribute('data-seat')) ?? '';

    await seat(page, position).focus();
    await page.keyboard.press('Space');
    await expect(seat(page, position)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('1 assento')).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(seat(page, position)).toHaveAttribute('aria-pressed', 'false');
  });
});
