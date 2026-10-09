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
const context = await browser.newContext();
const page = await context.newPage();
const url = 'http://127.0.0.1:4173/english-vocabulary/index.html?demo';
await page.goto(url);
await page.getByPlaceholder('你的名字').fill('<b>Alex</b>');
await page.getByRole('button', { name: '建立我的學習空間' }).click();
await page.getByRole('heading', { name: '<b>Alex</b>，今天也一起進步吧！' }).waitFor();
assert.equal(await page.locator('.hero h1 b').count(), 0);
await page.getByRole('button', { name: '開始／繼續今日學習' }).click();
await page.getByRole('button', { name: '閱讀完成，開始四選一' }).click();
await page.getByRole('button', { name: 'a', exact: true }).click();
await page.getByText('已完成 1 / 6', { exact: false }).waitFor();
await page.getByRole('button', { name: '暫停，稍後繼續' }).click();
await page.getByRole('button', { name: '⚙️ 設定', exact: true }).click();
const d = page.waitForEvent('download');
await page.getByRole('button', { name: '下載完整學習備份' }).click();
const download = await d;
await download.saveAs('work/test-backup.json');
const backup = JSON.parse(await fs.readFile('work/test-backup.json', 'utf8'));
assert.equal(backup.progress.length, 1);
page.on('dialog', (dlg) => dlg.accept('還原的學習者'));
await page.locator('input[type=file]').setInputFiles('work/test-backup.json');
await page.getByRole('button', { name: '🐱 還原的學習者', exact: true }).waitFor();
await page.getByRole('button', { name: '🐱 還原的學習者', exact: true }).click();
await page.getByRole('heading', { name: '還原的學習者，今天也一起進步吧！' }).waitFor();
assert.equal(
  await page.evaluate(
    () =>
      Object.values(JSON.parse(localStorage.getItem('english-demo-v1')).records).filter(
        (r) => Object.keys(r.progress).length === 1,
      ).length,
  ),
  2,
);
await page.evaluate(async () => {
  const { Store } = await import('./js/store.js');
  globalThis.testStore = new Store(false);
  testStore.uid = 'outbox-integration-test';
  testStore.profile = { id: 'a', timeZone: 'Asia/Taipei' };
  testStore.commit = async (e) => {
    globalThis.commitCount = (globalThis.commitCount || 0) + 1;
  };
});
await context.setOffline(true);
await page.evaluate(async () => {
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      testStore.queue({
        id: 'test-' + i,
        wordId: 'level2-0001',
        kind: 'new',
        planDate: '2026-01-01',
        actualDate: '2026-01-01',
        rating: 'remember',
        correct: true,
      }),
    ),
  );
});
assert.equal(
  await page.evaluate(async () => {
    const { outbox } = await import('./js/outbox.js');
    return (await outbox.list(testStore.uid)).length;
  }),
  20,
);
assert.equal(await page.evaluate(() => globalThis.commitCount || 0), 0);
await context.setOffline(false);
await page.evaluate(() => testStore.flush());
assert.equal(await page.evaluate(() => globalThis.commitCount), 20);
assert.equal(
  await page.evaluate(async () => {
    const { outbox } = await import('./js/outbox.js');
    return (await outbox.list(testStore.uid)).length;
  }),
  0,
);
await browser.close();
console.log(
  'Backup export and restore, original retained, HTML-as-text, 20 concurrent IndexedDB events, offline retention and reconnect flush passed. Cloud commits mocked.',
);
