// Проверка на магазина с Playwright — на телефон и на компютър.
// node tools/test-store.mjs            → локално (пуска сървър)
// node tools/test-store.mjs --live     → https://me7ko-dev.github.io/
// SHOTS=папка — къде да запише снимките от теста (по подразбиране test-shots/, не се качва в GitHub).
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const live = process.argv.includes('--live');
const OUT = process.env.SHOTS || path.join(ROOT, 'test-shots');
await fs.mkdir(OUT, { recursive: true });

let server;
let BASE = 'https://me7ko-dev.github.io/';
if (!live) {
  server = await serve(8961);
  BASE = 'http://localhost:8961/';
}

let fails = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) fails++;
};

// Пазачът: двата файла за Google Play трябва да са непокътнати.
for (const line of (await fs.readFile(path.join(ROOT, 'tools/protected.sha256'), 'utf8')).trim().split('\n')) {
  const [hash, file] = line.trim().split(/\s+\*?/);
  const real = live
    ? Buffer.from(await (await fetch(BASE + file)).arrayBuffer())
    : await fs.readFile(path.join(ROOT, file));
  ok(crypto.createHash('sha256').update(real).digest('hex') === hash, `${file} е непокътнат${live ? ' (на живо)' : ''}`);
}

const store = JSON.parse(await fs.readFile(path.join(ROOT, 'store.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

const setups = {
  телефон: { ...devices['Pixel 7'] },
  компютър: { viewport: { width: 1366, height: 860 } },
};

for (const [name, opts] of Object.entries(setups)) {
  console.log(`\n— ${name} —`);
  const ctx = await browser.newContext({ ...opts, locale: 'bg-BG' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const beacons = [];
  page.on('request', (r) => r.url().includes('workers.dev') && beacons.push(r.postData()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('.row').first().waitFor();
  const ids = await page.$$eval('.row a.open', (as) => [...new Set(as.map((a) => a.getAttribute('href').split('/').pop()))]);
  ok(ids.length === store.apps.length, `всички ${store.apps.length} приложения са на началната страница (видими: ${ids.length})`);
  ok((await page.locator('.feat').count()) === store.apps.filter((a) => a.featured).length, 'лентата „Избрано“ е пълна');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(overflow <= 0, `няма хоризонтално превъртане (${overflow}px)`);
  const brokenImgs = await page.$$eval('img', (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0 && i.loading !== 'lazy').map((i) => i.src));
  ok(brokenImgs.length === 0, `няма счупени картинки ${brokenImgs.join(' ')}`);
  await page.screenshot({ path: path.join(OUT, `${name}-1-начало.png`), fullPage: false });
  await page.screenshot({ path: path.join(OUT, `${name}-1-начало-цяла.png`), fullPage: true });

  // Категория
  await page.locator('.chip[data-cat="islyam"]').click();
  await page.waitForTimeout(200);
  const islam = await page.$$eval('.row b', (bs) => bs.map((b) => b.textContent));
  ok(islam.length === 2 && islam.includes('Куран-и Керим') && islam.includes('Муаллим'), `категория Ислям: ${islam.join(', ')}`);
  ok(page.url().endsWith('#/c/islyam'), 'адресът на категорията е #/c/islyam');
  await page.locator('.chip[data-cat="all"]').click();

  // Търсене
  await page.fill('#q', 'бургер');
  await page.waitForTimeout(200);
  const found = await page.$$eval('.row b', (bs) => bs.map((b) => b.textContent));
  ok(found.length === 1 && found[0] === 'Big Burger Business', `търсене „бургер“: ${found.join(', ')}`);
  await page.fill('#q', 'ззззз');
  ok(await page.locator('.empty').isVisible(), 'търсене без резултат показва съобщение');
  await page.fill('#q', '');

  // Подробности
  await page.locator('.row a.open[href="#/app/quran-kerim"]').first().click();
  const dlg = page.locator('dialog#app');
  await dlg.waitFor({ state: 'visible' });
  ok((await dlg.locator('#d-name').textContent()) === 'Куран-и Керим', 'страницата на Куран-и Керим се отваря');
  ok(page.url().endsWith('#/app/quran-kerim'), 'адресът е #/app/quran-kerim');
  ok((await dlg.locator('.shots img').count()) === 2, 'има 2 снимки от екрана');
  ok(await dlg.locator('a.btn.main[href="https://me7ko-dev.github.io/quran-kerim/"]').isVisible(), 'бутон „Отвори“');
  ok(await dlg.locator('[data-install="quran-kerim"]').isVisible(), 'бутон „Инсталирай“ (PWA)');
  ok(await dlg.locator('.note a[href*="groups.google.com"]').isVisible(), 'покана за тестери в Google Play');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}-2-куран.png`) });

  await dlg.locator('[data-install]').click();
  const how = page.locator('dialog#how');
  await how.waitFor({ state: 'visible' });
  ok((await how.locator('a.btn.main').getAttribute('href')).endsWith('quran-kerim/?install=1'), '„Инсталирай“ води към ?install=1');
  await page.screenshot({ path: path.join(OUT, `${name}-3-инсталирай.png`) });
  await how.locator('[data-close]').click();

  await dlg.locator('[data-close]').click();
  await page.waitForTimeout(300);
  ok(!(await dlg.isVisible()), '„Назад“ затваря страницата');
  ok(!page.url().includes('#/app/'), 'адресът се връща');

  // Приложение само за сваляне
  await page.goto(BASE + '#/app/genesis-agent');
  await dlg.waitFor({ state: 'visible' });
  ok(await dlg.locator('a[data-ev="dl_apk"]').isVisible(), 'Genesis: „Свали за Android“');
  ok(await dlg.locator('a[data-ev="dl_win"]').isVisible(), 'Genesis: „Свали за Windows“');
  const apkHref = await dlg.locator('a[data-ev="dl_apk"]').getAttribute('href');
  ok(apkHref.startsWith('https://github.com/me7ko-dev/genesis-agent/releases/download/'), 'линкът за APK е към GitHub Releases');
  await page.screenshot({ path: path.join(OUT, `${name}-4-genesis.png`) });

  // Направо по линк
  await page.goto(BASE + '#/app/metko-magnat');
  await dlg.waitFor({ state: 'visible' });
  ok((await dlg.locator('#d-name').textContent()) === 'Метко Магнат', 'линк направо към Метко Магнат работи');
  ok(await dlg.locator('a[data-ev="dl_apk"]').isVisible(), 'Метко Магнат: „Свали за Android“');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok(!(await dlg.isVisible()), 'Esc затваря страницата');

  ok(errors.length === 0, `без грешки в конзолата ${errors.join(' | ')}`);
  if (live) console.log(`  изпратени броения: ${beacons.length} ${beacons.slice(0, 4).join(' ')}`);
  await ctx.close();
}

await browser.close();
if (server) server.close();
console.log(fails ? `\n${fails} проблема` : '\nВсичко е наред');
process.exit(fails ? 1 : 0);
