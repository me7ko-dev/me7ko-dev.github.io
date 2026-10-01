// Снимки от екрана за магазина: shots/<id>-phone.jpg и shots/<id>-pc.jpg.
// Снима наново само ако приложението е променяно след последната снимка (и не по-често от веднъж на 3 дни),
// за да не расте репото излишно. Пуска се след build-store.mjs; локално: node tools/shots.mjs [id ...] [--all]
// Записва в shots/, store/shots.json и полето „shots“ в store.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const force = args.includes('--all');
const only = args.filter((a) => !a.startsWith('--'));
const MIN_GAP = 3 * 24 * 3600 * 1000;

const store = JSON.parse(await fs.readFile(path.join(ROOT, 'store.json'), 'utf8'));
const stateFile = path.join(ROOT, 'store/shots.json');
const state = JSON.parse(await fs.readFile(stateFile, 'utf8').catch(() => '{}') || '{}');
await fs.mkdir(path.join(ROOT, 'shots'), { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

async function shoot(app, kind) {
  const phone = kind === 'phone';
  const land = phone && app.landscape;
  const ctx = await browser.newContext({
    viewport: phone ? (land ? { width: 844, height: 390 } : { width: 390, height: 844 }) : { width: 1280, height: 800 },
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
    locale: 'bg-BG',
    userAgent: phone
      ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
      : undefined,
  });
  const page = await ctx.newPage();
  try {
    await page.goto(app.url, { waitUntil: 'load', timeout: 45000 });
  } catch (e) {
    console.warn(`  ${app.id} ${kind}: зареждането не завърши (${e.message.split('\n')[0]}) — снимам каквото има`);
  }
  await page.waitForTimeout(4000);
  const file = path.join(ROOT, `shots/${app.id}-${kind}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: phone ? 72 : 78 });
  await ctx.close();
}

let changed = false;
for (const app of store.apps) {
  if (!app.url) continue;
  if (only.length && !only.includes(app.id)) continue;
  const st = state[app.id];
  const stale = !st || (st.updated !== app.updated && Date.now() - Date.parse(st.at) > MIN_GAP);
  let missing = false;
  for (const kind of ['phone', 'pc']) {
    try { await fs.access(path.join(ROOT, `shots/${app.id}-${kind}.jpg`)); } catch { missing = true; }
  }
  if (!force && !only.length && !stale && !missing) continue;
  console.log(`снимам ${app.id}`);
  try {
    await shoot(app, 'phone');
    await shoot(app, 'pc');
    const now = new Date().toISOString();
    state[app.id] = { updated: app.updated, at: now, v: now.slice(0, 19).replace(/[-:T]/g, '') };
    changed = true;
  } catch (e) {
    console.warn(`  ${app.id}: снимката не стана — ${e.message}`);
  }
}
await browser.close();

// Полето „shots“ в store.json — с версия, за да не се показва старата снимка от кеша.
for (const app of store.apps) {
  const shots = [];
  for (const kind of ['phone', 'pc']) {
    const rel = `shots/${app.id}-${kind}.jpg`;
    try {
      await fs.access(path.join(ROOT, rel));
      shots.push({ kind, src: rel + (state[app.id]?.v ? `?v=${state[app.id].v}` : '') });
    } catch {}
  }
  if (JSON.stringify(shots) !== JSON.stringify(app.shots)) {
    app.shots = shots;
    changed = true;
  }
}
if (changed) {
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2) + '\n');
  await fs.writeFile(path.join(ROOT, 'store.json'), JSON.stringify(store, null, 2) + '\n');
}
console.log(changed ? 'снимките са обновени' : 'снимките са без промяна');
