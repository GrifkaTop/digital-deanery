import {test,expect} from '@playwright/test';
import{readFileSync}from'node:fs';import{parseEnv}from'node:util';
test.skip(!process.env.ATLAS_UI_ORIGIN,'Requires isolated stand');
test.use({baseURL:process.env.ATLAS_UI_ORIGIN,viewport:{width:360,height:780}});
test('Atlas connects screens, persists requests and clears account on logout',async({page})=>{
 const env=parseEnv(readFileSync('.env','utf8'));
 await page.goto('/login?next=%2Fprototype%23today');
 await page.getByLabel('Логин',{exact:true}).fill(env.DEMO_A_LOGIN!);await page.getByLabel('Пароль',{exact:true}).fill(env.DEMO_A_PASSWORD!);await page.getByRole('button',{name:'Войти',exact:true}).click();
 await expect(page).toHaveURL(/\/prototype#/);
 await expect(page.getByRole('heading',{name:'Главная',exact:true})).toBeVisible();
 for(const hash of ['profile','schedule','study','session','plan','deadlines','sports','services','inbox','news','events']){
 await page.goto('/prototype#'+hash);await expect(page.locator('#prototype-main')).toBeVisible();
 await expect(page.getByText('Не удалось загрузить данные.',{exact:true})).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 }
 await page.goto('/prototype#requests/new');
 await page.getByRole('link',{name:/Оформление пропуска в кампус/}).click();
 await page.getByLabel('Цель обращения').selectOption('lost');
 await page.getByRole('button',{name:'Продолжить',exact:true}).click();
 await page.getByRole('button',{name:'Отправить заявку',exact:true}).click();
 await expect(page).toHaveURL(/#requests\/[0-9a-f-]{36}$/);
 await page.reload();await expect(page.getByText('Замена утраченного',{exact:true})).toBeVisible();
 await page.goto('/prototype#profile');await expect(page.getByRole('heading',{name:'Студент Астра-01'})).toBeVisible();
 await page.getByRole('tab',{name:'Настройки'}).click();
 await page.getByRole('button',{name:/Выйти/}).click();await expect(page.getByRole('heading',{name:'Студент Астра-01'})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Вход в кабинет'})).toBeVisible();
 await page.getByLabel('Логин',{exact:true}).fill(env.DEMO_B_LOGIN!);await page.getByLabel('Пароль',{exact:true}).fill(env.DEMO_B_PASSWORD!);await page.getByRole('button',{name:'Войти',exact:true}).click();
 await expect(page).toHaveURL(/\/prototype#/);await page.goto('/prototype#profile');await expect(page.getByRole('heading',{name:'Студент Кварц-02'})).toBeVisible();
});
