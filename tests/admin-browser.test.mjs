import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
await fs.mkdir('work', { recursive: true });
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_ROOT || import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({
  ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '停用 6' : undefined));
await page.route('**/js/firebase.js', (route) =>
  route.fulfill({ contentType: 'text/javascript', path: 'tests/fixtures/mock-firebase.js' }),
);
await page.goto('http://127.0.0.1:4173/english-vocabulary/migration_tool.html');
assert.equal(await page.getByRole('button', { name: /Google|登入|登出/ }).count(), 0);
await page.getByRole('heading', { name: '📥 批次匯入' }).waitFor();
assert.equal(await page.locator('input[type=password]').count(), 0);
assert.equal(await page.evaluate(() => globalThis.__familyConnectionCalls), 1);
const sample = await fs.readFile('examples/demo.json', 'utf8');
await page.getByRole('textbox', { name: 'JSON 匯入', exact: true }).fill(sample);
await page.getByRole('button', { name: '驗證 JSON', exact: true }).click();
await page.getByText('驗證錯誤 0 · 拼字衝突警示 0').waitFor();
await page.getByRole('button', { name: '確認預覽並分批匯入' }).click();
await page.getByText('成功 6／失敗 0／略過 0', { exact: true }).waitFor();
await page.getByRole('button', { name: '確認預覽並分批匯入' }).click();
await page.getByText('成功 0／失敗 0／略過 6', { exact: true }).waitFor();
await page.getByRole('button', { name: '發布固定題庫版本' }).click();
await page.getByText('版本已發布，新建立的學習者會使用此版本。', { exact: true }).waitFor();
assert.equal(
  await page.evaluate(() => [...__mockCloud.values()].filter((v) => v.ready === true).length),
  1,
);
await page.screenshot({ path: 'work/admin-desktop.png', fullPage: true });
const workbook = await page.evaluate(() => {
  const wb = XLSX.utils.book_new();
  for (let n = 1; n <= 6; n++)
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['序號', '英文單字', '詞性', '中文意思', '英文例句', '中文翻譯'],
        [99, 'test', 'n.', '測試', 'This is a test.', '這是一個測試。'],
      ]),
      ' LEVEL' + n + ' ',
    );
  return Array.from(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
});
await page.locator('input[type=file]').setInputFiles({
  name: 'six-sheets.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer: Buffer.from(workbook),
});
await page.getByRole('button', { name: '驗證所有已選工作表' }).click();
await page.getByText('L1: 1 · L2: 1 · L3: 1 · L4: 1 · L5: 1 · L6: 1', { exact: true }).waitFor();
await page
  .getByRole('textbox', { name: 'JSON 匯入', exact: true })
  .fill('[{"level":2,"sequence":"bad"}]');
await page.getByRole('button', { name: '驗證 JSON', exact: true }).click();
await page
  .getByText('JSON 第 1 列 · sequence：序號須為 1～999999 的整數', { exact: true })
  .waitFor();
await page.setViewportSize({ width: 390, height: 844 });
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
await page.screenshot({ path: 'work/admin-mobile.png', fullPage: true });
const beforePages = await page.evaluate(() => {
  const sample = [...__mockCloud.entries()].find(([path]) => path.includes('/words/'))[1];
  for (let i = 0; i < 503; i++) {
    const id = 'fixture-' + i;
    __mockCloud.set('apps/english-vocabulary-v1/words/' + id, {
      ...sample,
      id,
      level: 3,
      sequence: 503 - i,
    });
  }
  return globalThis.__wordPageRequests;
});
await page.getByRole('button', { name: '重新讀取', exact: true }).click();
await page.getByText(/509 筆符合/).waitFor();
assert.equal((await page.evaluate(() => globalThis.__wordPageRequests)) - beforePages, 3);
const exportReady = page.waitForEvent('download');
await page.getByRole('button', { name: '匯出目前篩選 JSON', exact: true }).click();
await (await exportReady).saveAs('work/catalogue-regression.json');
const exported = JSON.parse(await fs.readFile('work/catalogue-regression.json', 'utf8'));
assert.equal(exported.length, 509);
assert.equal(new Set(exported.map((w) => w.id)).size, 509);
assert.deepEqual(
  exported.filter((w) => w.level === 3).map((w) => w.sequence),
  Array.from({ length: 503 }, (_, i) => i + 1),
);
await browser.close();
assert.deepEqual(errors, []);
console.log(
  'Admin UI checks passed: JSON preview, import, duplicate skip, version publication, six-sheet XLSX mapping, row error location, mobile overflow. Backend is mocked; this does not verify Firebase rules.',
);
