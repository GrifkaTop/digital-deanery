import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const env = parseEnv(readFileSync('.env', 'utf8'));
const book = 'f2000000-0000-4000-8000-000000000001';
for (const theme of ['light', 'dark'] as const) for (const width of [360, 1440]) {
  test(`home, events and library ${width} ${theme}`, async ({page, baseURL}) => {
    await page.emulateMedia({colorScheme: theme, reducedMotion: 'reduce'});
    await page.setViewportSize({width, height: 850});
    const csrf = await page.request.get('/api/v1/csrf');
    expect((await page.request.post('/api/v1/session/login', {headers: {Origin: baseURL!, 'X-CSRF-Token': (await csrf.json()).token}, data:{login:env.DEMO_A_LOGIN,password:env.DEMO_A_PASSWORD}})).status()).toBe(200);
    await page.goto('/prototype#today');
    await expect(page.getByRole('heading',{name:'Главная',exact:true})).toBeVisible();
    await expect(page.locator('.hm-calendar')).toHaveCount(0);
    await page.goto('/prototype#all-events');
    await page.getByRole('link',{name:'Календарь',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Календарь событий',exact:true})).toBeVisible();
    await page.goto('/prototype#library-loans');
    await expect(page.getByRole('heading',{name:'Читательский билет',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Мои брони',exact:false})).toBeVisible();
    await page.getByRole('button',{name:'Показать QR-код',exact:true}).press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:'Показать QR-код',exact:true})).toBeFocused();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({path:`/tmp/atlas-library-${width}-${theme}.png`,fullPage:true});
    await page.goto(`/prototype#library/${book}`);
    const downloading = page.waitForEvent('download');
    await page.getByRole('link',{name:'Скачать',exact:true}).press('Enter');
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/\.txt$/);
    expect(await download.failure()).toBeNull();
    const response = await page.request.get(`/api/v1/library/${book}/download`);
    expect(response.headers()['cache-control']).toBe('no-store, private');
    expect(await response.text()).toContain('Глава 1.');
    await page.goto('/prototype#clinic');
    await expect(page.getByRole('heading',{name:'Подготовка к приёму'})).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/МГИМО|МГТУ|Бауман|Читать онлайн/iu);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({path:`/tmp/atlas-clinic-${width}-${theme}.png`,fullPage:true});
  });
}
test('library bookings are private across A and B and downloads require a session', async ({browser, baseURL}) => {
  const contexts = await Promise.all([browser.newContext({baseURL,ignoreHTTPSErrors:true}),browser.newContext({baseURL,ignoreHTTPSErrors:true})]);
  const [a,b] = contexts.map(context=>context.request);
  const headers = async (api: typeof a) => ({Origin:baseURL!, 'X-CSRF-Token':(await (await api.get('/api/v1/csrf')).json()).token});
  try {
    for (const [index, api] of [a,b].entries()) expect((await api.post('/api/v1/session/login',{headers:await headers(api),data:{login:env[index?'DEMO_B_LOGIN':'DEMO_A_LOGIN'],password:env[index?'DEMO_B_PASSWORD':'DEMO_A_PASSWORD']}})).status()).toBe(200);
    const beforeB = await (await b.get('/api/v1/library/bookings')).json();
    const catalog = await (await a.get('/api/v1/library')).json();
    const selected = catalog.items.find((item:{booked:boolean;available:number})=>item.booked||item.available>0);
    expect(selected).toBeTruthy();
    const path = `/api/v1/library/${selected.id}/booking`;
    try {
      expect((await a.fetch(path,{method:selected.booked?'DELETE':'POST',headers:await headers(a)})).status()).toBe(200);
      expect(await (await b.get('/api/v1/library/bookings')).json()).toEqual(beforeB);
      const history = await a.get('/api/v1/library/bookings');
      expect(history.headers()['cache-control']).toBe('no-store, private');
      expect((await history.json()).items.find((item:{id:string})=>item.id===selected.id).active).toBe(!selected.booked);
    } finally {
      expect((await a.fetch(path,{method:selected.booked?'POST':'DELETE',headers:await headers(a)})).status()).toBe(200);
    }
    expect((await a.post('/api/v1/session/logout',{headers:await headers(a)})).status()).toBe(204);
    expect((await a.get(`/api/v1/library/${book}/download`)).status()).toBe(401);
    expect((await a.get('/api/v1/library/bookings')).status()).toBe(401);
  } finally { for(const context of contexts) await context.close(); }
});
