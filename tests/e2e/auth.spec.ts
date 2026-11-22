import { test, expect, request as requests } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
const env=parseEnv(readFileSync('.env','utf8'));
const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'https://localhost';

test('an expired server session closes private API and page content', async ({ page, context }) => {
 const database = process.env.INTERFACE_TEST_DATABASE_URL;
 test.skip(!database, 'Use an isolated test database.');
 const { Pool } = await import('pg');
 const pool = new Pool({ connectionString: database });
 const { token } = await (await page.request.get('/api/v1/csrf')).json();
 const login = await page.request.post('/api/v1/session/login', {
  headers: { Origin: origin, 'X-CSRF-Token': token },
  data: { login: env.DEMO_A_LOGIN, password: env.DEMO_A_PASSWORD },
 });
 try {
  expect(login.status()).toBe(200);
  const session = (await context.cookies()).find((cookie) => cookie.name === '__Host-session');
  if (!session) throw new Error('Missing session cookie');
  const digest = createHash('sha256').update(session.value).digest();
  const expired = await pool.query(
   "UPDATE sessions SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' WHERE token_hash = $1",
   [digest],
  );
  expect(expired.rowCount).toBe(1);
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Вход в кабинет' })).toBeVisible();
  await expect(page.getByText('Студент Астра-01', { exact: true })).toHaveCount(0);
 } finally {
  await pool.end();
 }
});
test('A/B profiles, CSRF, rotation, logout and strict input',async()=>{
 const c=await requests.newContext({baseURL:origin,ignoreHTTPSErrors:true});
 const token=async()=> (await (await c.get('/api/v1/csrf')).json()).token;
 const login=async(which:'A'|'B')=>c.post('/api/v1/session/login',{headers:{Origin:origin,'X-CSRF-Token':await token()},data:{login:env[`DEMO_${which}_LOGIN`],password:env[`DEMO_${which}_PASSWORD`]}});
 expect((await c.get('/api/v1/me')).status()).toBe(401);
 expect((await c.post('/api/v1/session/login',{data:{}})).status()).toBe(403);
 expect((await c.post('/api/v1/session/login',{headers:{Origin:'https://evil.example','X-CSRF-Token':await token()},data:{}})).status()).toBe(403);
 expect((await c.post('/api/v1/session/login',{headers:{Origin:origin,'X-CSRF-Token':await token()},data:{login:'x',password:'x',role:'admin'}})).status()).toBe(422);
 expect((await login('A')).status()).toBe(200);
 const a=await c.get('/api/v1/me');expect(a.headers()['cache-control']).toBe('no-store, private');expect((await a.json()).fullName).toBe('Студент Астра-01');
 const old=await c.storageState();
 expect((await c.get('/api/v1/me?id=other')).status()).toBe(422);
 expect((await login('B')).status()).toBe(200);
 expect((await (await c.get('/api/v1/me')).json()).fullName).toBe('Студент Кварц-02');
 const stale=await requests.newContext({baseURL:origin,ignoreHTTPSErrors:true,storageState:old});expect((await stale.get('/api/v1/me')).status()).toBe(401);await stale.dispose();
 const beforeLogout=await c.storageState();
 expect((await c.post('/api/v1/session/logout',{headers:{Origin:origin,'X-CSRF-Token':await token()}})).status()).toBe(204);
 const revoked=await requests.newContext({baseURL:origin,ignoreHTTPSErrors:true,storageState:beforeLogout});expect((await revoked.get('/api/v1/me')).status()).toBe(401);await revoked.dispose();await c.dispose();
});
test('mobile login, reload and logout',async({page})=>{
 await page.setViewportSize({width:360,height:800});await page.goto('/profile');await expect(page.getByRole('heading',{name:'Вход в кабинет'})).toBeVisible();
 await page.getByLabel('Логин',{exact:true}).fill(env.DEMO_A_LOGIN!);await page.getByLabel('Пароль',{exact:true}).fill(env.DEMO_A_PASSWORD!);await page.getByRole('button',{name:'Войти',exact:true}).click();
 await expect(page.getByText('Студент Астра-01',{exact:true})).toBeVisible();await page.reload();await expect(page.getByText('Студент Астра-01',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Выйти',exact:true}).click();await expect(page.getByRole('heading',{name:'Вход в кабинет'})).toBeVisible();await expect(page.getByText('Студент Астра-01',{exact:true})).toHaveCount(0);
});
test('logout clears another tab and browser history',async({page,context})=>{
 await page.goto('/login?next=/profile');await page.getByLabel('Логин',{exact:true}).fill(env.DEMO_B_LOGIN!);await page.getByLabel('Пароль',{exact:true}).fill(env.DEMO_B_PASSWORD!);await page.getByRole('button',{name:'Войти',exact:true}).click();await expect(page.getByText('Студент Кварц-02',{exact:true})).toBeVisible();
 const second=await context.newPage();await second.goto('/profile');await expect(second.getByText('Студент Кварц-02',{exact:true})).toBeVisible();
 await page.bringToFront();await page.getByRole('button',{name:'Выйти',exact:true}).click();await expect(page.getByRole('heading',{name:'Вход в кабинет'})).toBeVisible();
 await second.bringToFront();await expect(second.getByRole('heading',{name:'Вход в кабинет'})).toBeVisible();await expect(second.getByText('Студент Кварц-02',{exact:true})).toHaveCount(0);
 await second.goto('/');await second.goBack();await expect(second.getByRole('heading',{name:'Вход в кабинет'})).toBeVisible();
});
test('unknown login is limited before repeated password work',async()=>{
 const c=await requests.newContext({baseURL:origin,ignoreHTTPSErrors:true});
 const token=(await (await c.get('/api/v1/csrf')).json()).token;
 const login=`unknown-${crypto.randomUUID()}`;let limited=false;
 for(let i=0;i<11;i++){const r=await c.post('/api/v1/session/login',{headers:{Origin:origin,'X-CSRF-Token':token},data:{login,password:'invalid'}});if(r.status()===429){expect(r.headers()['retry-after']).toBe('900');limited=true;break;}expect(r.status()).toBe(401);}
 expect(limited).toBe(true);await c.dispose();
});

test('login form survives switching browser tabs',async({page,context})=>{
 await page.goto('/login');
 await page.getByLabel('Логин',{exact:true}).fill('student-example');
 await page.getByLabel('Пароль',{exact:true}).fill('synthetic-password');
 const second=await context.newPage();await second.goto('/login');await second.bringToFront();
 await page.bringToFront();
 await expect(page.getByLabel('Логин',{exact:true})).toHaveValue('student-example');
 await expect(page.getByLabel('Пароль',{exact:true})).toHaveValue('synthetic-password');
});

test('switching accounts clears the previous profile in another tab', async ({ page, context }) => {
 const login = async (account: 'A' | 'B') => {
  await page.getByLabel('Логин', { exact: true }).fill(env[`DEMO_${account}_LOGIN`]!);
  await page.getByLabel('Пароль', { exact: true }).fill(env[`DEMO_${account}_PASSWORD`]!);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
 };
 await page.goto('/login?next=/profile');
 await login('A');
 await expect(page.getByText('Студент Астра-01', { exact: true })).toBeVisible();
 const requestsA = await (await page.request.get('/api/v1/requests')).json();
 const inboxA = await (await page.request.get('/api/v1/inbox')).json();
 expect(requestsA.items.length).toBeGreaterThan(0);
 const second = await context.newPage();
 await second.goto('/profile');
 await expect(second.getByText('Студент Астра-01', { exact: true })).toBeVisible();
 await second.goto('/requests/new?kind=study_certificate');
 await second.getByLabel('Назначение').selectOption('study_contest');
 await page.bringToFront();
 await page.getByRole('button', { name: 'Выйти', exact: true }).click();
 await expect(page.getByRole('heading', { name: 'Вход в кабинет' })).toBeVisible();
 await login('B');
 await expect(page).not.toHaveURL(/\/login/);
 await page.goto('/profile');
 await expect(page.getByText('Студент Кварц-02', { exact: true })).toBeVisible();
 await second.bringToFront();
 await expect(second.getByRole('link', { name: /Студент Кварц-02/ })).toBeVisible();
 await expect(second.getByRole('main').getByText('Студент Кварц-02', { exact: true })).toBeVisible();
 await expect(second.getByText('Студент Астра-01', { exact: true })).toHaveCount(0);
 const requestsB = await (await second.request.get('/api/v1/requests')).json();
 const inboxB = await (await second.request.get('/api/v1/inbox')).json();
 expect(requestsB.items.length).toBeGreaterThan(0);
 for (const item of requestsA.items) {
  expect(requestsB.items).not.toContainEqual(expect.objectContaining({ id: item.id }));
 }
 expect(inboxB.unreadCount).not.toBe(inboxA.unreadCount);
 const purpose = second.getByLabel('Назначение');
 await expect(purpose).toBeVisible();
 await expect(purpose).not.toHaveValue('study_contest');
});

test('a delayed private response is discarded after logout', async ({ page }) => {
 await page.goto('/login?next=/profile');
 await page.getByLabel('Логин', { exact: true }).fill(env.DEMO_A_LOGIN!);
 await page.getByLabel('Пароль', { exact: true }).fill(env.DEMO_A_PASSWORD!);
 await page.getByRole('button', { name: 'Войти', exact: true }).click();
 await expect(page.getByText('Студент Астра-01', { exact: true })).toBeVisible();
 let release = () => {};
 let intercepted = () => {};
 const blocked = new Promise<void>((resolve) => { release = resolve; });
 const started = new Promise<void>((resolve) => { intercepted = resolve; });
 await page.route((url) => url.pathname === '/api/v1/study', async (route) => {
  const response = await route.fetch();
  intercepted();
  await blocked;
  await route.fulfill({ response }).catch(() => {});
 }, { times: 1 });
 try {
  await page.getByRole('link', { name: 'Учёба', exact: true }).click();
  await started;
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Вход в кабинет' })).toBeVisible();
 } finally {
  release();
 }
 await expect(page.getByText('Студент Астра-01', { exact: true })).toHaveCount(0);
 await page.goBack();
 await expect(page.getByRole('heading', { name: 'Вход в кабинет' })).toBeVisible();
 await expect(page.getByText('Академическое письмо', { exact: true })).toHaveCount(0);
});
