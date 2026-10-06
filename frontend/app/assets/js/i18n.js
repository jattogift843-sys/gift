/* Site-wide language translator.
 *
 * Lets a visitor from any country read MT5 Smart Market in their own language.
 * A styled picker is injected into the top navigation (landing) or the topbar
 * (dashboard / admin); on small screens it falls back to a floating button.
 *
 * Translation is done with Google's website translation engine. The chosen
 * language is stored in the `googtrans` cookie + localStorage and applied on
 * every page load, so the choice sticks across the whole site.
 */

const STORE_KEY = 'mt5_lang';
const COOKIE = 'googtrans';

/* Curated list — the languages our members actually sign up in, by region. */
const LANGS = [
  { code: 'en',    label: 'English',    native: 'English',           flag: '🇬🇧' },
  { code: 'fr',    label: 'French',     native: 'Français',          flag: '🇫🇷' },
  { code: 'es',    label: 'Spanish',    native: 'Español',           flag: '🇪🇸' },
  { code: 'pt',    label: 'Portuguese', native: 'Português',         flag: '🇵🇹' },
  { code: 'de',    label: 'German',     native: 'Deutsch',           flag: '🇩🇪' },
  { code: 'it',    label: 'Italian',    native: 'Italiano',          flag: '🇮🇹' },
  { code: 'nl',    label: 'Dutch',      native: 'Nederlands',        flag: '🇳🇱' },
  { code: 'ru',    label: 'Russian',    native: 'Русский',           flag: '🇷🇺' },
  { code: 'uk',    label: 'Ukrainian',  native: 'Українська',        flag: '🇺🇦' },
  { code: 'pl',    label: 'Polish',     native: 'Polski',            flag: '🇵🇱' },
  { code: 'ro',    label: 'Romanian',   native: 'Română',            flag: '🇷🇴' },
  { code: 'tr',    label: 'Turkish',    native: 'Türkçe',            flag: '🇹🇷' },
  { code: 'ar',    label: 'Arabic',     native: 'العربية',           flag: '🇸🇦' },
  { code: 'fa',    label: 'Persian',    native: 'فارسی',             flag: '🇮🇷' },
  { code: 'ur',    label: 'Urdu',       native: 'اردو',              flag: '🇵🇰' },
  { code: 'hi',    label: 'Hindi',      native: 'हिन्दी',             flag: '🇮🇳' },
  { code: 'bn',    label: 'Bengali',    native: 'বাংলা',             flag: '🇧🇩' },
  { code: 'zh-CN', label: 'Chinese',    native: '中文 (简体)',        flag: '🇨🇳' },
  { code: 'ja',    label: 'Japanese',   native: '日本語',             flag: '🇯🇵' },
  { code: 'ko',    label: 'Korean',     native: '한국어',             flag: '🇰🇷' },
  { code: 'vi',    label: 'Vietnamese', native: 'Tiếng Việt',        flag: '🇻🇳' },
  { code: 'th',    label: 'Thai',       native: 'ไทย',               flag: '🇹🇭' },
  { code: 'id',    label: 'Indonesian', native: 'Bahasa Indonesia',  flag: '🇮🇩' },
  { code: 'ms',    label: 'Malay',      native: 'Bahasa Melayu',     flag: '🇲🇾' },
  { code: 'fil',   label: 'Filipino',   native: 'Filipino',          flag: '🇵🇭' },
  { code: 'sw',    label: 'Swahili',    native: 'Kiswahili',         flag: '🇰🇪' },
  { code: 'ha',    label: 'Hausa',      native: 'Hausa',             flag: '🇳🇬' },
  { code: 'yo',    label: 'Yoruba',     native: 'Yorùbá',            flag: '🇳🇬' },
  { code: 'ig',    label: 'Igbo',       native: 'Igbo',              flag: '🇳🇬' },
  { code: 'zu',    label: 'Zulu',       native: 'isiZulu',           flag: '🇿🇦' },
  { code: 'af',    label: 'Afrikaans',  native: 'Afrikaans',         flag: '🇿🇦' },
  { code: 'am',    label: 'Amharic',    native: 'አማርኛ',             flag: '🇪🇹' },
];
const CODES = LANGS.map((l) => l.code);
const byCode = (c) => LANGS.find((l) => l.code === c) || LANGS[0];

/* ---------- cookie / storage helpers ---------- */
function readCookiePair() {
  const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
  if (!m) return null;
  const parts = decodeURIComponent(m[1]).split('/'); // "/en/es"
  return parts[2] || null;
}
function writeCookie(target) {
  const value = target && target !== 'en' ? `/en/${target}` : '';
  const host = location.hostname;
  // clear then set across every path/domain scope Google might read
  const scopes = ['', `; domain=${host}`, `; domain=.${host}`];
  for (const sc of scopes) {
    document.cookie = `${COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${sc}`;
    if (value) document.cookie = `${COOKIE}=${value}; path=/${sc}`;
  }
}
function currentLang() {
  let v = null;
  try { v = localStorage.getItem(STORE_KEY); } catch { /* */ }
  v = v || readCookiePair() || '';
  return CODES.includes(v) ? v : 'en';
}
function guessFromBrowser() {
  const nav = (navigator.languages || [navigator.language || 'en']).map((s) => s.toLowerCase());
  for (const raw of nav) {
    if (raw.startsWith('zh')) return 'zh-CN';
    const base = raw.split('-')[0];
    const hit = CODES.find((c) => c.toLowerCase() === raw || c.toLowerCase().split('-')[0] === base);
    if (hit) return hit;
  }
  return 'en';
}

/* ---------- Google engine ---------- */
let engineLoaded = false;
function loadEngine() {
  if (engineLoaded) return;
  engineLoaded = true;

  const holder = document.createElement('div');
  holder.id = 'goog-te-hidden';
  holder.setAttribute('translate', 'no');
  document.body.appendChild(holder);

  window.googleTranslateElementInit = function () {
    try {
      // eslint-disable-next-line no-new, no-undef
      new google.translate.TranslateElement(
        { pageLanguage: 'en', includedLanguages: CODES.join(','), autoDisplay: false },
        'goog-te-hidden',
      );
    } catch { /* */ }
  };
  const s = document.createElement('script');
  s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  s.async = true;
  document.head.appendChild(s);
}

function applyLanguage(code, { reload = true } = {}) {
  try { localStorage.setItem(STORE_KEY, code); } catch { /* */ }
  writeCookie(code);
  if (reload) { location.reload(); return; }
  loadEngine();
}

/* ---------- styling (banner suppression + picker) ---------- */
function injectStyles() {
  if (document.getElementById('mt5-i18n-style')) return;
  const css = `
    /* hide everything Google injects except the translation itself */
    .goog-te-banner-frame, .goog-te-gadget-icon, .goog-tooltip, .goog-tooltip *,
    #goog-gt-tt, .goog-te-balloon-frame, .skiptranslate iframe { display: none !important; }
    .goog-text-highlight { background: none !important; box-shadow: none !important; }
    body { top: 0 !important; position: static !important; }
    #goog-te-hidden { display: none !important; }
    font[style] { background: transparent !important; box-shadow: none !important; }

    .mt5-lang { position: relative; font-size: 13px; z-index: 60; }
    .mt5-lang__btn {
      display: inline-flex; align-items: center; gap: 7px; cursor: pointer;
      padding: 7px 11px; border-radius: 999px; line-height: 1;
      background: var(--panel, rgba(17,24,39,.72));
      border: 1px solid var(--border-strong, rgba(148,163,184,.28));
      color: var(--text, #e8edf6); font: inherit; white-space: nowrap;
    }
    .mt5-lang__btn:hover { border-color: var(--brand, #00e0a4); }
    .mt5-lang__btn .flag { font-size: 15px; }
    .mt5-lang__btn .caret { opacity: .6; font-size: 10px; }
    .mt5-lang__menu {
      position: absolute; right: 0; margin-top: 8px; width: 248px; max-height: 60vh;
      overflow-y: auto; padding: 6px; border-radius: 14px;
      background: var(--panel-solid, #0e1524);
      border: 1px solid var(--border-strong, rgba(148,163,184,.28));
      box-shadow: 0 24px 60px -18px rgba(0,0,0,.7);
    }
    .mt5-lang__menu[hidden] { display: none; }
    .mt5-lang__search {
      width: 100%; box-sizing: border-box; margin-bottom: 6px; padding: 8px 10px;
      border-radius: 9px; border: 1px solid var(--border, rgba(148,163,184,.14));
      background: var(--bg-1, #0a0f1c); color: var(--text, #e8edf6); font: inherit;
    }
    .mt5-lang__opt {
      display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
      padding: 8px 10px; border-radius: 9px; border: 0; cursor: pointer;
      background: transparent; color: var(--text, #e8edf6); font: inherit;
    }
    .mt5-lang__opt:hover { background: var(--bg-2, #111827); }
    .mt5-lang__opt.is-active { background: rgba(0,224,164,.14); color: var(--brand, #00e0a4); }
    .mt5-lang__opt .native { opacity: .6; margin-left: auto; font-size: 12px; }
    .mt5-lang--float {
      position: fixed; right: 16px; bottom: 16px;
    }
    .mt5-lang--float .mt5-lang__menu { bottom: calc(100% + 8px); margin: 0; }
    @media (max-width: 760px) {
      .mt5-lang__btn .lbl { display: none !important; }
      .mt5-lang__btn { padding: 7px 9px; gap: 4px; }
      .mt5-lang__menu { width: 220px; right: -10px; }
    }
  `;
  const el = document.createElement('style');
  el.id = 'mt5-i18n-style';
  el.textContent = css;
  document.head.appendChild(el);
}

/* ---------- picker widget ---------- */
function buildPicker() {
  const cur = byCode(currentLang());
  const wrap = document.createElement('div');
  wrap.className = 'mt5-lang notranslate';
  wrap.setAttribute('translate', 'no');
  wrap.innerHTML = `
    <button type="button" class="mt5-lang__btn" aria-haspopup="listbox" aria-expanded="false" title="Choose language">
      <span class="flag">${cur.flag}</span><span class="lbl">${cur.code === 'en' ? 'Language' : cur.native}</span><span class="caret">▼</span>
    </button>
    <div class="mt5-lang__menu" hidden role="listbox">
      <input type="text" class="mt5-lang__search notranslate" placeholder="Search language…" aria-label="Search language" />
      <div class="mt5-lang__list"></div>
    </div>`;

  const btn = wrap.querySelector('.mt5-lang__btn');
  const menu = wrap.querySelector('.mt5-lang__menu');
  const list = wrap.querySelector('.mt5-lang__list');
  const search = wrap.querySelector('.mt5-lang__search');

  const render = (q = '') => {
    const term = q.trim().toLowerCase();
    const active = currentLang();
    list.innerHTML = LANGS
      .filter((l) => !term
        || l.label.toLowerCase().includes(term)
        || l.native.toLowerCase().includes(term)
        || l.code.toLowerCase().includes(term))
      .map((l) => `
        <button type="button" class="mt5-lang__opt ${l.code === active ? 'is-active' : ''}" data-code="${l.code}" role="option">
          <span class="flag">${l.flag}</span><span>${l.label}</span><span class="native">${l.native}</span>
        </button>`)
      .join('') || '<div class="mt5-lang__opt" style="opacity:.5">No match</div>';
  };
  render();

  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  const open = () => {
    menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
    search.value = ''; render(); search.focus();
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden ? open() : close(); });
  search.addEventListener('input', () => render(search.value));
  search.addEventListener('click', (e) => e.stopPropagation());
  list.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-code]');
    if (!opt) return;
    close();
    applyLanguage(opt.dataset.code);
  });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  return wrap;
}

function mountPicker() {
  const picker = buildPicker();

  // landing page — into the top nav
  const navLinks = document.querySelector('.nav .nav-links');
  if (navLinks) {
    const signIn = navLinks.querySelector('a[href="/login"], a[href="/register"]');
    navLinks.insertBefore(picker, signIn || null);
    return;
  }
  // dashboard / admin — pinned to the right edge of the sticky topbar
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    picker.style.flex = '0 0 auto';
    topbar.appendChild(picker);
    return;
  }
  // login / register / anything else — floating button
  picker.classList.add('mt5-lang--float');
  document.body.appendChild(picker);
}

/* ---------- boot ---------- */
function boot() {
  injectStyles();

  // keep the company name untranslated wherever it appears as branding
  document.querySelectorAll('.brand, [data-no-translate]').forEach((el) => {
    el.classList.add('notranslate');
    el.setAttribute('translate', 'no');
  });

  // first-ever visit: adopt the browser's language if we support it.
  // Only do the auto-switch when we can actually persist the choice, so a
  // reload can never loop back into this branch.
  let stored = null;
  let canPersist = false;
  try {
    stored = localStorage.getItem(STORE_KEY);
    localStorage.setItem('mt5_lang_test', '1');
    localStorage.removeItem('mt5_lang_test');
    canPersist = true;
  } catch { /* storage blocked */ }
  if (canPersist && !stored && !readCookiePair()) {
    const guess = guessFromBrowser();
    if (guess !== 'en') { applyLanguage(guess); return; } // reloads once, translated
    try { localStorage.setItem(STORE_KEY, 'en'); } catch { /* */ }
  }

  // make sure the cookie matches the stored choice, then load the engine
  const lang = currentLang();
  if (lang !== 'en') { writeCookie(lang); loadEngine(); }

  mountPicker();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
