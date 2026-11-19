import { expect, test, type Page } from '@playwright/test';
import { EVENT_TITLE, ORGANIZER, OTHER_ORGANIZER_EVENT } from './support';

async function signIn(page: Page, password: string): Promise<void> {
  await page.goto('/admin');
  await page.getByLabel('E-mail').fill(ORGANIZER.email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.describe('painel do organizador', () => {
  test('senha errada não entra', async ({ page }) => {
    await signIn(page, 'senha-errada-123');
    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sair' })).toBeHidden();
  });

  test('a produtora vê só os próprios eventos e a sessão sobrevive ao recarregar', async ({ page, context }) => {
    await signIn(page, ORGANIZER.password);
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();

    // The session lives in an httpOnly cookie that page scripts cannot read.
    const cookie = (await context.cookies()).find((candidate) => candidate.name === 'plateia_admin');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict' });

    await page.getByRole('combobox', { name: 'Evento' }).click();
    const options = page.getByRole('listbox');
    await expect(options.getByRole('option', { name: EVENT_TITLE })).toBeVisible();
    await expect(options.getByRole('option', { name: OTHER_ORGANIZER_EVENT })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();

    // Signing out goes straight back to the login, with no dashboard data left on screen...
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
    await expect(page.getByText('Não foi possível carregar o painel')).toBeHidden();
    // ...and the server ended the session: a reload does not sign back in.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });
});
