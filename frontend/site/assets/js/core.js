/* Shared client helpers for MT5 Smart Market.
 *
 * This file is deployed identically in both frontend bundles (frontend/site and
 * frontend/app). Cross-origin URLs come from window.MT5 (see each bundle's
 * config.js): MT5.apiBase, MT5.siteUrl, MT5.appUrl. Empty = same origin. */

const CFG = (typeof window !== 'undefined' && window.MT5) || {};
export const API_BASE = CFG.apiBase || '/api';
export const SITE_URL = CFG.siteUrl || '';
export const APP_URL = CFG.appUrl || '';

const TOKEN_KEY = 'mt5_token';

export const store = {
  get token() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set token(v) {
    try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
};

(function adoptTokenFromHash() {
  try {
    const m = /[#&?](?:t|access_token)=([^&]+)/.exec(location.href);
    if (m) {
      const tok = decodeURIComponent(m[1]);
      store.token = tok;
      document.cookie = `token=${encodeURIComponent(tok)}; path=/; max-age=604800; SameSite=Lax`;
      if (location.hash && location.hash.includes('t=')) {
        history.replaceState(null, '', location.pathname + location.search);
      }
    }
  } catch { /* ignore */ }
})();

export async function api(path, { method = 'GET', body, silent = false, timeoutMs = 10000 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (store.token) headers.Authorization = `Bearer ${store.token}`;
  let res;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const isTimeout = err?.name === 'AbortError';
    const msg = isTimeout ? 'Request timed out — please check your connection' : 'Network error — is the server running?';
    if (!silent) toast(msg, 'error');
    throw new Error(isTimeout ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    const msg = json?.error?.message || `Request failed (${res.status})`;
    if (!silent) toast(msg, 'error');
    const err = new Error(msg);
    err.status = res.status;
    err.code = json?.error?.code;
    throw err;
  }
  return json.data;
}

/* ---------- currency / format ---------- */
export const fmtMoney = (n, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(n || 0));
export const fmtNum = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtDate = (s) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDay = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const timeAgo = (s) => {
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

/* ---------- toast ---------- */
export function toast(message, kind = 'info', ms = 4200) {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 250); }, ms);
}

/* ---------- inline form error alert ---------- */
export function showFormError(target, message, kind = 'error') {
  let node = typeof target === 'string' ? document.querySelector(target) : target;
  if (!node) return;
  const icon = kind === 'warning' || kind === 'warn' ? '⚠️' : (kind === 'info' ? 'ℹ️' : '🚨');
  node.className = `auth-alert ${kind === 'warn' ? 'warning' : kind}`;
  node.innerHTML = `
    <span class="ico">${icon}</span>
    <div class="msg">${message}</div>
    <span class="close" title="Dismiss">✕</span>
  `;
  node.classList.remove('hidden');
  node.querySelector('.close')?.addEventListener('click', () => node.classList.add('hidden'));
}
export function clearFormError(target) {
  let node = typeof target === 'string' ? document.querySelector(target) : target;
  if (node) node.classList.add('hidden');
}

/* ---------- dom ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const el = (tag, props = {}, ...kids) => {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  });
  kids.flat().forEach((c) => node.append(c?.nodeType ? c : document.createTextNode(String(c))));
  return node;
};

export async function requireAuth(role) {
  try {
    let data;
    try {
      data = await api('/auth/me', { silent: true });
    } catch (err) {
      if (store.token && (err?.status === 401 || err?.message === 'network')) {
        await new Promise((r) => setTimeout(r, 200));
        data = await api('/auth/me', { silent: true });
      } else {
        throw err;
      }
    }
    const user = data.user;
    if (role && user.role !== role) {
      location.href = user.role === 'admin' ? '/admin' : '/app';
      return null;
    }
    return user;
  } catch {
    location.href = `${SITE_URL}/login?next=${encodeURIComponent(location.pathname)}`;
    return null;
  }
}

export async function logout() {
  await api('/auth/logout', { method: 'POST', silent: true }).catch(() => {});
  store.token = null;
  location.href = `${SITE_URL}/login`;
}

export function modal(node) {
  const backdrop = el('div', { class: 'modal-backdrop' });
  const card = el('div', { class: 'card modal' });
  card.append(node);
  backdrop.append(card);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.body.append(backdrop);
  return { close: () => backdrop.remove() };
}

/**
 * In-app confirmation dialog. Native confirm() is blocked in many embedded
 * browsers (it silently returns false), so we never use it. Returns a Promise
 * that resolves true / false.
 */
export function confirmDialog(message, { title = 'Please confirm', confirmText = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    const box = el('div');
    box.innerHTML = `
      <h3>${title}</h3>
      <p class="muted mt-1" style="font-size:13.5px">${message}</p>
      <div class="row mt-3" style="justify-content:flex-end">
        <button class="btn ghost sm" data-x>Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'} sm" data-ok>${confirmText}</button>
      </div>`;
    const m = modal(box);
    let done = false;
    const finish = (v) => { if (done) return; done = true; m.close(); resolve(v); };
    box.querySelector('[data-ok]').addEventListener('click', () => finish(true));
    box.querySelector('[data-x]').addEventListener('click', () => finish(false));
    box.closest('.modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) finish(false);
    });
  });
}

/** In-app text prompt. Resolves the entered string, or null if cancelled. */
export function promptDialog(message, { title = 'Enter a value', placeholder = '', value = '', confirmText = 'OK', multiline = false } = {}) {
  return new Promise((resolve) => {
    const box = el('div');
    box.innerHTML = `
      <h3>${title}</h3>
      <p class="muted mt-1" style="font-size:13.5px">${message}</p>
      <div class="field mt-2">${multiline
        ? `<textarea class="input" rows="3" placeholder="${placeholder}">${value}</textarea>`
        : `<input class="input" placeholder="${placeholder}" value="${value}" />`}</div>
      <div class="row" style="justify-content:flex-end">
        <button class="btn ghost sm" data-x>Cancel</button>
        <button class="btn primary sm" data-ok>${confirmText}</button>
      </div>`;
    const m = modal(box);
    const input = box.querySelector('input, textarea');
    setTimeout(() => input.focus(), 30);
    let done = false;
    const finish = (v) => { if (done) return; done = true; m.close(); resolve(v); };
    box.querySelector('[data-ok]').addEventListener('click', () => finish(input.value));
    box.querySelector('[data-x]').addEventListener('click', () => finish(null));
    box.closest('.modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) finish(null);
    });
    if (!multiline) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(input.value); });
  });
}
