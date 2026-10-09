import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
await fs.mkdir('work', { recursive: true });
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_ROOT || import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:4173/english-vocabulary/index.html?demo');
await page.getByPlaceholder('你的名字').fill('小晴');
await page.getByRole('button', { name: '建立我的學習空間' }).click();
await page.getByRole('heading', { name: '小晴，今天也一起進步吧！' }).waitFor();
await page.screenshot({ path: 'work/home-desktop.png', fullPage: true });
await page.getByRole('button', { name: '開始／繼續今日學習' }).click();
await page.getByRole('heading', { name: 'a/an', exact: true }).waitFor();
await page.getByRole('button', { name: '試著回想，再顯示中文與用法' }).click();
await page.getByRole('button', { name: '開始回想／測驗' }).click();
await page.getByRole('button', { name: '我已回想，顯示答案' }).click();
await page.getByRole('button', { name: '😊 記得', exact: true }).click();
await page.getByRole('heading', { name: 'ability', exact: true }).waitFor();
await page.getByRole('button', { name: '試著回想，再顯示中文與用法' }).click();
await page.getByRole('button', { name: '開始回想／測驗' }).click();
await page.getByLabel('練習題型').selectOption('spell');
await page.getByRole('textbox', { name: '英文答案' }).fill('wrong');
await page.getByRole('button', { name: '核對答案' }).click();
if (await page.getByRole('button', { name: '😊 記得', exact: true }).isEnabled())
  throw Error('Wrong spelling still permits remember');
await page.getByRole('button', { name: '🤔 不熟', exact: true }).click();
await page.getByRole('heading', { name: 'able', exact: true }).waitFor();
await page.getByRole('button', { name: '先休息，稍後再來' }).click();
await page.reload();
await page.getByRole('heading', { name: '小晴，今天也一起進步吧！' }).waitFor();
await page.getByRole('button', { name: '＋', exact: true }).click();
await page.getByPlaceholder('你的名字').fill('小樹');
await page.getByRole('button', { name: '建立我的學習空間' }).click();
await page.getByRole('heading', { name: '小樹，今天也一起進步吧！' }).waitFor();
const data = await page.evaluate(() => JSON.parse(localStorage.getItem('english-demo-v1')));
const profiles = Object.values(data.profiles);
const one = profiles.find((p) => p.name === '小晴'),
  two = profiles.find((p) => p.name === '小樹');
if (
  Object.keys(data.records[one.id].progress).length !== 2 ||
  Object.keys(data.records[two.id].progress).length !== 0
)
  throw Error('Profile isolation failed');
await page.getByRole('button', { name: '🐱 小晴', exact: true }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: 'work/home-mobile.png', fullPage: true });
if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
  throw Error('Mobile page overflow');
await page.getByRole('button', { name: '🔎 單字總覽', exact: true }).click();
await page.getByLabel('等級', { exact: true }).selectOption('2');
await page.getByRole('button').filter({ hasText: 'ability' }).first().click();
await page.screenshot({ path: 'work/card-mobile.png', fullPage: true });
await page.getByRole('button', { name: '關閉', exact: true }).click();
await page.setViewportSize({ width: 1024, height: 1366 });
await page.getByRole('button', { name: '🗓️ 首頁日曆', exact: true }).click();
if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
  throw Error('Tablet overflow');
await page.route('**/js/firebase.js', (route) =>
  route.fulfill({ contentType: 'text/javascript', path: 'tests/fixtures/mock-firebase.js' }),
);
await page.goto('http://127.0.0.1:4173/english-vocabulary/migration_tool.html');
await page.getByRole('heading', { name: '⚙️ 英文單字管理系統' }).waitFor();
if (await page.getByRole('button', { name: /Google|登入|登出/ }).count())
  throw Error('Unexpected login control');
await page.screenshot({ path: 'work/admin-entry.png', fullPage: true });
await fs.writeFile(
  'work/browser-results.json',
  JSON.stringify(
    {
      errors,
      checks: [
        'profile creation',
        'first recall',
        'wrong spelling cannot mark remember',
        'reload persistence',
        'two-profile isolation',
        'mobile 390px no overflow',
        'tablet 1024px no overflow',
        'word browsing and detail modal',
        'project subpath',
        'password-free admin entry',
      ],
    },
    null,
    2,
  ),
);
await browser.close();
if (errors.length) throw Error(errors.join('\n'));
console.log('10 browser checks passed');
