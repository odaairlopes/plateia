import { expect, test } from '@playwright/test';
import {
  EVENT_TITLE,
  ORGANIZER,
  checkout,
  freeSeats,
  holdTimer,
  newVisitor,
  openSeatMap,
  reserve,
  seat,
  uniqueEmail,
} from './support';

test.describe('compra de ingressos', () => {
  test('pagamento aprovado emite o ingresso e a venda chega ao painel da produtora', async ({ page, browser }, testInfo) => {
    // The whole journey through the shell and the three remotes, as a visitor would do it.
    await page.goto('/');
    await page.getByRole('link', { name: EVENT_TITLE }).click();
    await expect(page.getByRole('heading', { level: 1, name: EVENT_TITLE })).toBeVisible();
    await page.getByRole('link', { name: 'Escolher assentos' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Escolha seus assentos' })).toBeVisible();

    const positions = await freeSeats(page, 2);
    for (const position of positions) {
      await seat(page, position).click();
      await expect(seat(page, position)).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(page.getByText('2 assentos')).toBeVisible();

    await reserve(page);
    await expect(holdTimer(page)).toBeVisible();
    for (const position of positions) {
      await expect(seat(page, position)).toHaveAccessibleName(/reservado para você/);
    }

    await checkout(page, { name: 'Teste Ponta a Ponta', email: uniqueEmail('approve') });

    // The payment settles asynchronously through the saga; the page polls the order.
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Tudo certo, Teste! Seus lugares estão garantidos.')).toBeVisible({ timeout: 20_000 });
    const orderId = page.url().split('/').pop() ?? '';
    const code = orderId.slice(0, 8).toUpperCase();
    await expect(page.getByText(code)).toBeVisible();

    // The seats are now sold for everyone.
    await openSeatMap(page);
    for (const position of positions) {
      await expect(seat(page, position)).toHaveAttribute('data-status', 'sold');
    }

    // The organizer who owns the event sees the sale (the read model is fed by events).
    const organizer = await newVisitor(browser, testInfo);
    const admin = organizer.page;
    await admin.goto('/admin');
    await admin.getByLabel('E-mail').fill(ORGANIZER.email);
    await admin.getByLabel('Senha').fill(ORGANIZER.password);
    await admin.getByRole('button', { name: 'Entrar' }).click();

    const recentOrders = admin.getByRole('table', { name: 'Últimos pedidos' });
    await expect(async () => {
      await admin.getByRole('button', { name: 'Atualizar dados' }).click();
      await expect(recentOrders.getByRole('cell', { name: code, exact: true })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await organizer.context.close();
  });

  test('pagamento recusado cancela o pedido e devolve o assento à venda', async ({ page }) => {
    await openSeatMap(page);
    const [position = ''] = await freeSeats(page, 1);

    await seat(page, position).click();
    await reserve(page);
    await expect(holdTimer(page)).toBeVisible();
    await checkout(page, { name: 'Teste Recusado', email: uniqueEmail('decline') }, 'decline');

    await expect(page.getByText('O pedido não foi concluído')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('O pagamento foi recusado. Os assentos voltaram a ficar disponíveis.')).toBeVisible();

    await page.getByRole('link', { name: 'Escolher assentos novamente' }).click();
    await expect(seat(page, position)).toHaveAttribute('data-status', 'available');
  });
});
