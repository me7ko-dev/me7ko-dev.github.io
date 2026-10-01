// Проверка на брояча на живо: всяко приложение праща ли „open“ със своето име, работи ли балончето „Инсталирай“.
// Броенията се хващат от теста и НЕ стигат до Cloudflare, за да не се пълни таблото с лъжливи числа.
// node tools/test-brojach.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const OUT = process.env.SHOTS || 'test-shots';
await fs.mkdir(OUT, { recursive: true });
const APPS = ['super-metko-run', 'bubble-booble-game', 'ritam-zoo', 'peeshta-ferma', 'sazvezdie', 'umnik', 'metko-magnat', 'big-burger-business', 'windows20-mobile'];
const store = await (await fetch('https://me7ko-dev.github.io/store.json?t=' + Date.now())).json();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };

async function open(url, opts = {}) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'bg-BG', ...opts });
  // Броячът не брои роботи (navigator.webdriver). Тук се правим на човек, но броенията ги спираме ние.
  await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  const sent = [];
  await ctx.route('https://metko-stor.roikata023.workers.dev/**', (route) => {
    sent.push(route.request().postData());
    route.fulfill({ status: 204 });
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);
  return { ctx, page, sent };
}

for (const id of APPS) {
  const app = store.apps.find((a) => a.id === id);
  const { ctx, sent } = await open(app.url + '?t=' + Date.now());
  ok(sent.some((b) => b === JSON.stringify({ a: id, e: 'open' })), `${id}: праща „open“ (${sent.join(' ') || 'нищо'})`);
  await ctx.close();
}

// Балончето „Инсталирай“ (идва от бутона в магазина)
{
  const app = store.apps.find((a) => a.id === 'windows20-mobile');
  const { ctx, page } = await open(app.url + '?install=1');
  await page.waitForTimeout(1500);
  const text = await page.evaluate(() => {
    const host = [...document.body.children].find((el) => el.shadowRoot);
    return host ? host.shadowRoot.textContent : '';
  });
  ok(/Инсталирай|начален екран|менюто/.test(text), `windows20-mobile: балончето „Инсталирай“ се показва („${text.slice(0, 60)}…“)`);
  ok(!page.url().includes('install=1'), 'адресът се изчиства от ?install=1');
  await page.screenshot({ path: path.join(OUT, 'брояч-инсталирай.png') });
  await ctx.close();
}

// Самият магазин
{
  const { ctx, page, sent } = await open('https://me7ko-dev.github.io/');
  await page.locator('.row a.open[href="#/app/umnik"]').first().click();
  await page.waitForTimeout(800);
  ok(sent.includes(JSON.stringify({ a: 'stor', e: 'open' })), 'магазинът брои, че е отворен');
  ok(sent.includes(JSON.stringify({ a: 'umnik', e: 'view' })), 'магазинът брои разглеждане на Умник');
  await ctx.close();
}

await browser.close();
console.log(fails ? `${fails} проблема` : 'Броячът е наред');
process.exit(fails ? 1 : 0);
