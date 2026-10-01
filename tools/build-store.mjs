// Събира приложенията с topic „metko-store“ от GitHub и прави store.json.
// Пуска се от GitHub Action (store.yml) веднъж на ден и при промяна; локално: node tools/build-store.mjs
// Пипа само store.json — никога .well-known/ и .nojekyll.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNER = 'me7ko-dev';
const TOPIC = 'metko-store';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

async function gh(p, tries = 3) {
  try {
    const r = await fetch('https://api.github.com' + p, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'metko-stor',
        ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`GitHub ${p}: ${r.status} ${await r.text()}`);
    return await r.json();
  } catch (e) {
    if (tries <= 1) throw e;
    await new Promise((ok) => setTimeout(ok, 3000));
    return gh(p, tries - 1);
  }
}

async function get(url, type = 'text') {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'metko-stor' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    return type === 'json' ? await r.json() : await r.text();
  } catch {
    return null;
  }
}

// Вид на файла за сваляне по името му. Контролни суми и текстове не влизат.
function fileKind(name) {
  const n = name.toLowerCase();
  if (/\.(sha256|sha512|md5|sig|asc|txt|json|yml|yaml|blockmap)$/.test(n) || n.includes('sha256sums')) return null;
  if (n.endsWith('.apk')) return 'apk';
  if (n.endsWith('.exe') || n.endsWith('.msi')) return 'win';
  if (n.endsWith('.zip') && /(win|windows|x64|x86)/.test(n)) return 'win';
  return null;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4]) : null;
}

function links(html, rel) {
  return (html.match(/<link\b[^>]*>/gi) || []).filter((t) =>
    (attr(t, 'rel') || '').toLowerCase().split(/\s+/).includes(rel),
  );
}

function iconSize(sizes) {
  if (!sizes) return 0;
  if (sizes === 'any') return 512;
  return Math.max(...sizes.split(/\s+/).map((s) => parseInt(s, 10) || 0));
}

// Иконка, манифест и заглавие от самия сайт на приложението.
async function siteInfo(url) {
  const info = { title: null, icon: null, pwa: false, themeColor: null, orientation: null };
  const html = await get(url);
  if (!html) return info;
  const t = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (t) info.title = t[1].trim();
  const theme = (html.match(/<meta\b[^>]*name=["']theme-color["'][^>]*>/i) || [])[0];
  if (theme) info.themeColor = attr(theme, 'content');

  const manTag = links(html, 'manifest')[0];
  if (manTag) {
    const manUrl = new URL(attr(manTag, 'href'), url).href;
    const man = await get(manUrl, 'json');
    if (man) {
      info.pwa = true;
      info.themeColor = info.themeColor || man.theme_color || null;
      info.orientation = man.orientation || null;
      const icons = (man.icons || [])
        .filter((i) => !i.purpose || i.purpose.split(/\s+/).includes('any'))
        .map((i) => ({ src: new URL(i.src, manUrl).href, size: iconSize(i.sizes) }))
        .filter((i) => i.size >= 96)
        .sort((a, b) => Math.abs(a.size - 256) - Math.abs(b.size - 256));
      if (icons[0]) info.icon = icons[0].src;
    }
  }
  if (!info.icon) {
    // Иконки, вградени като data:, се пропускат — в магазина тогава се показва емоджито.
    const ok = (h) => h && !/data:/i.test(h) && !/\.ico(\?|$)/i.test(h);
    const tag = [...links(html, 'apple-touch-icon'), ...links(html, 'icon')].find((l) => ok(attr(l, 'href')));
    if (tag) info.icon = new URL(attr(tag, 'href'), url).href;
  }
  return info;
}

async function exists(rel) {
  try {
    await fs.access(path.join(ROOT, rel));
    return true;
  } catch {
    return false;
  }
}

function splitDescription(desc) {
  if (!desc) return [null, null];
  const m = desc.match(/^(.{2,40}?)\s*(?:—|–|:)\s+(.+)$/);
  return m ? [m[1].trim(), m[2].trim()] : [null, desc.trim()];
}

async function main() {
  const conf = JSON.parse(await fs.readFile(path.join(ROOT, 'store/apps.json'), 'utf8'));
  const shotsState = JSON.parse((await fs.readFile(path.join(ROOT, 'store/shots.json'), 'utf8').catch(() => '{}')) || '{}');

  const repos = [];
  for (let page = 1; ; page++) {
    const batch = await gh(`/users/${OWNER}/repos?per_page=100&type=owner&page=${page}`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  const chosen = repos.filter((r) => !r.private && !r.archived && (r.topics || []).includes(TOPIC));

  const apps = [];
  for (const r of chosen) {
    const id = r.name.toLowerCase();
    const ov = conf.apps[id] || {};
    if (ov.hidden) continue;

    const url = ov.url || r.homepage || (r.has_pages ? `https://${OWNER}.github.io/${r.name}/` : null);
    const site = url ? await siteInfo(url) : { title: null, icon: null, pwa: false, themeColor: null, orientation: null };

    // Файлове за сваляне: последното издание с APK/.exe + общо свалени от всички издания.
    const releases = (await gh(`/repos/${r.full_name}/releases?per_page=100`)).filter((x) => !x.draft);
    let downloads = 0;
    const byKind = { apk: 0, win: 0 };
    let release = null;
    for (const rel of releases) {
      const files = rel.assets
        .map((a) => ({ kind: fileKind(a.name), name: a.name, url: a.browser_download_url, size: a.size, downloads: a.download_count }))
        .filter((f) => f.kind);
      for (const f of files) {
        downloads += f.downloads;
        byKind[f.kind] += f.downloads;
      }
      if (!release && files.length && !rel.prerelease) {
        release = { tag: rel.tag_name, date: rel.published_at || rel.created_at, files };
      }
    }
    if (!release) {
      const rel = releases.find((x) => x.assets.some((a) => fileKind(a.name)));
      if (rel) {
        release = {
          tag: rel.tag_name,
          date: rel.published_at || rel.created_at,
          files: rel.assets
            .map((a) => ({ kind: fileKind(a.name), name: a.name, url: a.browser_download_url, size: a.size, downloads: a.download_count }))
            .filter((f) => f.kind),
        };
      }
    }

    const [descName, descRest] = splitDescription(r.description);
    const topicCat = Object.entries(conf.categories).find(([, c]) => c.topics.some((t) => (r.topics || []).includes(t)));
    const shots = [];
    for (const kind of ['phone', 'pc']) {
      const rel = `shots/${id}-${kind}.jpg`;
      if (await exists(rel)) shots.push({ kind, src: rel + (shotsState[id]?.v ? `?v=${shotsState[id].v}` : '') });
    }

    apps.push({
      id,
      repo: r.full_name,
      code: r.html_url,
      name: ov.name || descName || site.title || r.name,
      tagline: ov.tagline || descRest || '',
      description: ov.description || r.description || '',
      category: ov.category || (topicCat ? topicCat[0] : 'instrumenti'),
      url,
      icon: ov.icon === null ? null : ov.icon || site.icon,
      emoji: ov.emoji || conf.categories[ov.category || (topicCat ? topicCat[0] : 'instrumenti')]?.emoji || '📦',
      color: ov.color || site.themeColor || '#334155',
      pwa: site.pwa,
      landscape: ov.landscape ?? /landscape/.test(site.orientation || ''),
      featured: !!ov.featured,
      play: ov.play || null,
      release,
      downloads: release || downloads ? { total: downloads, apk: byKind.apk, win: byKind.win } : null,
      updated: r.pushed_at,
      shots,
    });
  }

  const order = conf.order || [];
  const rank = (a) => (order.includes(a.id) ? order.indexOf(a.id) : 1000);
  apps.sort((a, b) => rank(a) - rank(b) || b.updated.localeCompare(a.updated));

  const categories = Object.entries(conf.categories).map(([id, c]) => ({ id, name: c.name, emoji: c.emoji }));
  const out = { updated: new Date().toISOString(), categories, apps };

  // Записва само ако има истинска промяна (иначе всеки ден ще има празен commit).
  const file = path.join(ROOT, 'store.json');
  const old = JSON.parse(await fs.readFile(file, 'utf8').catch(() => '{}') || '{}');
  const same = JSON.stringify({ ...old, updated: 0 }) === JSON.stringify({ ...out, updated: 0 });
  if (same) {
    console.log(`store.json е без промяна (${apps.length} приложения)`);
    return;
  }
  await fs.writeFile(file, JSON.stringify(out, null, 2) + '\n');
  console.log(`store.json: ${apps.length} приложения — ${apps.map((a) => a.id).join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
