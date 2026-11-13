import { test, expect, type Page, type Route } from '@playwright/test';
import { open, waitRun, sim, type W } from './helpers';

/**
 * Classement en ligne : le serveur Supabase est simulé (page.route), on vérifie le parcours joueur :
 * classement lisible sans compte → connexion par code e-mail → pseudo → sauvegarde cloud → run envoyée.
 */
const SB = 'https://dmekimsahjdnvkusblrm.supabase.co';
const USER = { id: '11111111-1111-1111-1111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'joueur@exemple.fr', app_metadata: {}, user_metadata: {}, created_at: '2026-11-13T00:00:00Z' };

async function fakeServer(page: Page) {
  const calls: Array<{ path: string; body: unknown }> = [];
  let player: Record<string, unknown> | null = null;
  let save: Record<string, unknown> | null = null;
  await page.route(`${SB}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    calls.push({ path: `${req.method()} ${url.pathname}`, body });
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': '*' } });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const p = url.pathname;
    if (p === '/auth/v1/otp') return json({});
    if (p === '/auth/v1/verify') {
      if (body?.token !== '123456') return json({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403);
      return json({ access_token: 'tok', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ref', user: USER });
    }
    if (p === '/auth/v1/user') return json(USER);
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (p === '/rest/v1/players') return json(player ? [player] : []);
    if (p === '/rest/v1/rpc/set_pseudo') { player = { id: USER.id, pseudo: body.p_pseudo, best_wave: 0, wins: 0, runs: 0, best_time: null, chests: 0, streak_max: 0 }; return json(player); }
    if (p === '/rest/v1/rpc/leaderboard_progress') return json([
      { rank: 1, player_id: 'x', pseudo: 'Lune', best_wave: 21, wins: 3, best_time: 1250, runs: 40 },
      ...(player ? [{ rank: 2, player_id: USER.id, pseudo: player.pseudo, best_wave: 3, wins: 0, best_time: null, runs: 1 }] : []),
    ]);
    if (p === '/rest/v1/rpc/leaderboard_daily') return json([{ rank: 1, player_id: 'x', pseudo: 'Lune', score: 15000, wave: 6, won: false, hero: 'mei' }]);
    if (p === '/rest/v1/rpc/leaderboard_missions') return json([]);
    if (p === '/rest/v1/rpc/my_ranks') return json({ progress: 2, daily: null, missions: null, players: 2 });
    if (p === '/rest/v1/rpc/submit_run') return json({ id: 1 });
    if (p === '/rest/v1/cloud_saves') {
      if (req.method() === 'GET') return json(save ? [save] : []);
      if (req.method() === 'POST') { save = { ...body, rev: 1 }; return json(null, 201); }
      if (req.method() === 'PATCH') { save = { ...save, ...body }; return json([{ rev: body.rev }]); }
    }
    return json({ message: `non simulé : ${p}` }, 404);
  });
  return calls;
}

test('classement en ligne : invité, connexion par code, pseudo, sauvegarde cloud et envoi d\'une run', async ({ page }) => {
  const calls = await fakeServer(page);
  const errors = await open(page);
  const title = page.getByRole('dialog', { name: 'Menu principal' });
  await title.getByRole('button', { name: '🌐 Classement en ligne' }).click();
  const scr = page.getByRole('dialog', { name: 'Classement en ligne' });
  await expect(scr).toContainText('Lune');
  await expect(scr).toContainText('Connecte-toi pour y figurer');
  await scr.getByRole('tab', { name: 'Défi du jour' }).click();
  await expect(scr).toContainText('15 000');

  // Connexion : e-mail → code (un mauvais code d'abord) → pseudo.
  await scr.getByRole('button', { name: 'Se connecter' }).click();
  await scr.getByLabel('Adresse e-mail').fill('joueur@exemple.fr');
  await scr.getByRole('button', { name: 'Recevoir le code' }).click();
  await scr.getByLabel('Code reçu par e-mail').fill('000000');
  await scr.getByRole('button', { name: 'Valider' }).click();
  await expect(scr.locator('.sc-ol-note')).toContainText('Code invalide');
  await scr.getByLabel('Code reçu par e-mail').fill('123456');
  await scr.getByRole('button', { name: 'Valider' }).click();
  // « p » tapé dans le champ ne doit pas fermer l'écran (raccourci Pause).
  await scr.getByLabel('Pseudo').pressSequentially('Pip');
  await expect(scr).toBeVisible();
  await scr.getByRole('button', { name: 'Valider' }).click();
  await expect(scr).toContainText('👤 Pip');
  await expect.poll(() => calls.some((c) => c.path === 'POST /rest/v1/cloud_saves')).toBe(true); // première sauvegarde envoyée
  await expect(scr).toContainText('Progression sauvegardée dans le cloud');

  // Une vraie run depuis le titre : envoyée au classement à la fin.
  await scr.getByRole('button', { name: '⚔ Partir en run' }).click();
  await waitRun(page);
  await sim(page, 12);
  await page.evaluate(() => (window as unknown as W).game.scenes.current.debugKillHero());
  await sim(page, 2.5);
  await expect(page.getByRole('dialog', { name: 'Fin de la run' })).toBeVisible();
  await expect.poll(() => calls.find((c) => c.path === 'POST /rest/v1/rpc/submit_run')?.body).toMatchObject({ p_hero: 'taro', p_won: false });
  await expect.poll(() => calls.some((c) => c.path === 'PATCH /rest/v1/cloud_saves')).toBe(true);

  // Retour au titre : le pseudo s'affiche ; après rechargement la session est gardée.
  await page.getByRole('dialog', { name: 'Fin de la run' }).getByRole('button', { name: 'Menu principal' }).click();
  await expect(title.getByRole('button', { name: /Classement · Pip/ })).toBeVisible();
  await page.reload();
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('dialog', { name: 'Menu principal' }).getByRole('button', { name: /Classement/ }).click();
  await expect(page.getByRole('dialog', { name: 'Classement en ligne' })).toContainText('👤 Pip');
  await page.getByRole('dialog', { name: 'Classement en ligne' }).getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('dialog', { name: 'Classement en ligne' }).getByRole('button', { name: 'Se connecter' })).toBeVisible();
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test('sans réseau : le classement affiche une erreur claire et le jeu reste jouable', async ({ page }) => {
  await page.route(`${SB}/**`, (r) => r.abort('internetdisconnected'));
  const errors = await open(page);
  await page.getByRole('dialog', { name: 'Menu principal' }).getByRole('button', { name: '🌐 Classement en ligne' }).click();
  const scr = page.getByRole('dialog', { name: 'Classement en ligne' });
  await expect(scr).toContainText('Pas de connexion au serveur');
  await scr.getByRole('button', { name: 'Retour' }).click();
  await expect(page.getByRole('dialog', { name: 'Menu principal' })).toBeVisible();
  expect(errors.filter((e) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(e))).toEqual([]);
});
