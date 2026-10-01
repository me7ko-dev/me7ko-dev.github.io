/* Метко Стор — анонимен брояч и помощник за инсталиране.
   Праща само: кое приложение, какво стана (отворено, инсталирано…) — денят и държавата се добавят в Cloudflare.
   Без бисквитки, без IP адреси, без имена и без нищо, записано на устройството.
   В приложение се слага с един ред:  <script src="/brojach.js" data-app="umnik" defer></script> */
(function () {
  var B = 'https://metko-stor.roikata023.workers.dev/b';
  var me = document.currentScript;
  var app = (me && me.getAttribute('data-app')) || '';
  var bot = navigator.webdriver || /bot|crawl|spider|headless|lighthouse|pagespeed/i.test(navigator.userAgent);
  var local = /^(localhost|127\.|192\.168\.|\[::1\])/.test(location.hostname) || location.protocol === 'file:';

  function broi(ev, a) {
    a = a || app;
    if (!B || bot || local || !a) return;
    try {
      var body = JSON.stringify({ a: a, e: ev });
      if (!(navigator.sendBeacon && navigator.sendBeacon(B, body))) {
        fetch(B, { method: 'POST', body: body, keepalive: true, mode: 'no-cors' });
      }
    } catch (e) {}
  }
  window.metkoBroi = broi;
  if (!app) return;

  var standalone =
    navigator.standalone === true ||
    matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)').matches;

  // Отваряне. Презареждане на страницата не се брои.
  var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  if (!nav || nav.type !== 'reload') broi(standalone ? 'open_pwa' : 'open');
  addEventListener('appinstalled', function () { broi('install'); });

  // ?install=1 идва от бутона „Инсталирай“ в магазина.
  var prompt = null;
  addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    prompt = e;
    if (box) show();
  });
  var box = null;
  if (/[?&]install=1\b/.test(location.search) && !standalone) {
    var clean = location.search.replace(/([?&])install=1\b&?/, '$1').replace(/[?&]$/, '');
    try { history.replaceState(history.state, '', location.pathname + clean + location.hash); } catch (e) {}
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  function start() {
    var host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;';
    box = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    setTimeout(show, prompt ? 0 : 2500);
  }

  function show() {
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var name = (document.title || 'приложението').split(/\s[–—|-]\s/)[0];
    var text, btn = '';
    if (prompt) {
      text = 'Сложи „' + name + '“ на телефона или компютъра си — отваря се като истинско приложение.';
      btn = '<button class="go">Инсталирай</button>';
    } else if (ios) {
      text = 'Натисни бутона <b>Сподели</b> <span aria-hidden="true">⬆️</span> долу и избери <b>„Добави към началния екран“</b>.';
    } else {
      text = 'Отвори менюто на браузъра <b>⋮</b> и избери <b>„Инсталирай приложението“</b> или <b>„Добави към началния екран“</b>.';
    }
    box.innerHTML =
      '<style>' +
      '.b{all:initial;display:flex;gap:12px;align-items:center;margin:12px;padding:14px 16px;border-radius:18px;' +
      'background:#111827;color:#f9fafb;border:1px solid rgba(255,255,255,.18);font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:560px;margin-inline:auto}' +
      '.t{flex:1;color:inherit;font:inherit}.t b{font-weight:700}' +
      'button{all:initial;cursor:pointer;font:600 15px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;border-radius:999px}' +
      '.go{background:#6366f1;color:#fff;padding:10px 16px}.x{color:#9ca3af;padding:6px 10px;font-size:20px}' +
      'button:focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}' +
      '</style><div class="b" role="dialog" aria-label="Инсталиране"><div class="t">' + text + '</div>' + btn +
      '<button class="x" aria-label="Затвори">×</button></div>';
    var go = box.querySelector('.go');
    if (go) go.onclick = function () { prompt.prompt(); prompt = null; close(); };
    box.querySelector('.x').onclick = close;
  }

  function close() { if (box) box.host.remove(); box = null; }
})();
