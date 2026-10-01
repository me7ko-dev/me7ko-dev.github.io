# Метко Стор — me7ko-dev.github.io

Магазинът с всичко, което правя: игри, ислямски приложения, за деца и инструменти. Хората разглеждат, отварят, инсталират или свалят.

- **Магазинът:** https://me7ko-dev.github.io/
- **Репо:** https://github.com/me7ko-dev/me7ko-dev.github.io

## ⚠️ Не пипай: `.well-known/assetlinks.json` и `.nojekyll`

Android приложението **Куран-и Керим** в Google Play (`bg.quran.app`) доказва чрез тях, че сайтът е негов.
Ако се развалят, приложението показва адресна лента най-горе.

- `assetlinks.json` съдържа два отпечатъка: на ключа на Google (Play App Signing) `84:A8:…:A6:2B` и на ключа за качване `43:6A:…:08:F1`.
- `.nojekyll` е нужен, иначе GitHub Pages скрива папки, започващи с точка (като `.well-known`).
- `tools/protected.sha256` пази отпечатъка на двата файла. GitHub Action-ът и тестът спират, ако се променят.

Проверка: https://me7ko-dev.github.io/.well-known/assetlinks.json (трябва да се види JSON с `bg.quran.app`) и официално от Google:
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://me7ko-dev.github.io&relation=delegate_permission/common.handle_all_urls

## Как се добавя ново приложение (една стъпка)

В GitHub отвори репото на приложението → ⚙️ до „About“ → в **Topics** добави `metko-store` и една категория:

| Topic | Категория |
|---|---|
| `game` | 🎮 Игри |
| `islam` | 🕌 Ислям |
| `kids` | 🧸 За деца |
| `tools` | 🧰 Инструменти |

Това е всичко. До един ден магазинът го показва сам: име, описание, сайт, иконка, снимки от екрана и файловете за сваляне от последното издание (Releases).
Ако не искаш да чакаш: GitHub → репото на магазина → **Actions → Магазин → Run workflow**.

Репото трябва да е **публично**. От частно репо GitHub не дава файловете и сайта на други хора.

По желание: хубаво име, текст на български, емоджи и цвят се пишат в [`store/apps.json`](store/apps.json) (ключът е името на репото с малки букви).
Там е и редът на приложенията, и кои са в „Избрано“. Ако махнеш topic-а, приложението изчезва от магазина.

Бутоните се появяват сами:
- **Отвори** — ако репото има сайт (GitHub Pages или „Website“ в About);
- **Инсталирай** — ако сайтът има `manifest.webmanifest` (PWA);
- **Свали за Android / Windows** — ако последното издание в Releases има `.apk`, `.exe`, `.msi` или `…windows….zip`;
- **Google Play** — от `store/apps.json` (`"play"`).

## Броячът

Без бисквитки, без IP адреси и без имена. Записва се само: приложение, събитие, ден и държава.

| Какво | Откъде |
|---|---|
| Свалени APK и .exe | от GitHub (`download_count` в Releases), записва се веднъж на ден |
| Отворен магазин, разгледано приложение, кликове „Отвори“/„Свали“ | от магазина |
| Отваряне на приложение, инсталиране (PWA) | от `brojach.js` в самото приложение |

За да брои едно приложение отварянията и инсталиранията, в неговия `index.html` (преди `</head>`) трябва да има един ред:

```html
<script>if(location.hostname==='me7ko-dev.github.io'){const s=document.createElement('script');s.src='/brojach.js';s.dataset.app='umnik';document.head.appendChild(s)}</script>
```

`'umnik'` се сменя с името на репото с малки букви. Редът зарежда брояча само на истинския сайт. На компютъра, в Windows програмата и в APK-то не прави нищо и не дава грешки.
Същият ред показва и балончето „Инсталирай“, когато човек дойде от бутона в магазина.

Приложение, което е в Google Play, получава реда само след обновена политика за поверителност и „Data safety“.

## Как работи магазинът

- `index.html` — страницата (без build, чист HTML/CSS/JS). Чете `store.json`.
- `store.json` — списъкът с приложения. Прави го **GitHub Action „Магазин“** (`.github/workflows/store.yml`) всеки ден в 06:23 и при промяна.
- `tools/build-store.mjs` — събира репотата с topic `metko-store`, иконките, манифестите и Releases.
- `tools/shots.mjs` — снимки от екрана с Playwright (телефон и компютър). Снима наново само променените приложения.
- `brojach.js` — броячът и балончето „Инсталирай“.

Пускане на компютъра (в папката на репото):

```
npm install --no-save playwright
node tools/serve.mjs              → http://localhost:8960/
node tools/test-store.mjs         → тест на телефон и компютър (--live = на истинския сайт)
```

Другите ми сайтове (`/quran-kerim/`, `/umnik/` и т.н.) са отделни репота и продължават да работят както досега.
