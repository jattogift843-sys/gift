import {
  api, store, toast, $, $$, el, requireAuth, logout, modal, confirmDialog,
  fmtMoney, fmtNum, fmtDate, fmtDay, timeAgo,
} from '/assets/js/core.js';

const state = {
  user: null, cfg: null, dashboard: null, currency: 'USD',
  quotes: [], plans: [], tradeSide: 'buy',
};
const C = (n) => fmtMoney(n, state.currency);
let active = 'overview';

/* ============================ TRADINGVIEW ============================ */
const TV_SYMBOLS = {
  EURUSD: 'FX:EURUSD', GBPUSD: 'FX:GBPUSD', USDJPY: 'FX:USDJPY',
  XAUUSD: 'OANDA:XAUUSD', BTCUSD: 'BINANCE:BTCUSDT', ETHUSD: 'BINANCE:ETHUSDT',
  US30: 'CAPITALCOM:US30', NAS100: 'CAPITALCOM:US100',
};
const tvSymbol = (s) => TV_SYMBOLS[s] || `FX:${s}`;

let tvLoading = null;
function loadTradingView() {
  if (window.TradingView) return Promise.resolve();
  if (tvLoading) return tvLoading;
  tvLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/tv.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { tvLoading = null; reject(new Error('tv')); };
    document.head.appendChild(s);
  });
  return tvLoading;
}

async function mountChart(containerId, symbol, { interval = '60', tall = false } = {}) {
  const host = document.getElementById(containerId);
  if (!host) return;
  try {
    await loadTradingView();
  } catch {
    host.innerHTML = '<div class="empty">Live chart unavailable (offline).</div>';
    return;
  }
  host.innerHTML = '';
  /* eslint-disable no-new, no-undef */
  new TradingView.widget({
    container_id: containerId,
    symbol: tvSymbol(symbol),
    interval,
    autosize: true,
    timezone: 'Etc/UTC',
    theme: 'dark',
    style: '1',
    locale: 'en',
    toolbar_bg: '#0e1524',
    enable_publishing: false,
    hide_side_toolbar: !tall,
    allow_symbol_change: true,
    withdateranges: true,
    details: tall,
    studies: tall ? ['MASimple@tv-basicstudies'] : [],
  });
}

/* ============================ BOOT ============================ */
(async function boot() {
  const user = await requireAuth('user');
  if (!user) return;
  state.user = user;
  state.currency = user.currency || 'USD';
  paintIdentity();
  $('#balance').textContent = C(user.balance ?? 0);

  const toggleSidebar = (force) => {
    const s = $('#sidebar');
    const b = $('#sidebar-backdrop');
    const open = force !== undefined ? force : !s.classList.contains('open');
    s?.classList.toggle('open', open);
    b?.classList.toggle('open', open);
  };
  $('#logout').addEventListener('click', logout);
  $('#toggle').addEventListener('click', () => toggleSidebar());
  $('#sidebar-backdrop')?.addEventListener('click', () => toggleSidebar(false));
  $$('#nav .side-link').forEach((l) => l.addEventListener('click', () => go(l.dataset.view)));
  wireBell();

  const initial = location.hash.slice(1);
  go(document.getElementById(`view-${initial}`) ? initial : 'overview');

  try { state.cfg = await api('/config', { silent: true }); } catch { /* */ }
  await refresh();
  if (active === 'overview' && renderers.overview) renderers.overview();

  setInterval(pollQuotes, 5000);
  setInterval(refresh, 12000);
  // refresh the moment the user returns to the tab, so an admin balance
  // change / approval shows up straight away
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('focus', refresh);
})();

function paintIdentity() {
  const u = state.user;
  $('#uname').textContent = u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;
  $('#uemail').textContent = u.email;
  $('#avatar').textContent = (u.firstName || u.name || u.email || '?').charAt(0).toUpperCase();
}

async function refresh() {
  try {
    // keep the account record (name, balance, currency) current
    const me = await api('/auth/me', { silent: true });
    if (me?.user) { state.user = { ...state.user, ...me.user }; state.currency = me.user.currency || state.currency; paintIdentity(); }

    const d = await api('/me/dashboard', { silent: true });
    state.dashboard = d;
    state.currency = d.profile?.currency || state.currency;
    if (d.profile) state.user = { ...state.user, ...d.profile };
    $('#balance').textContent = C(d.summary.balance);
    paintBell(d.unreadNotifications, d.notifications);
    paintNotifBar(d.notifications);
    showPopups(d.popups);
    if (active === 'overview') {
      if (!$('#ov-stats')) renderers.overview(); // first successful load
      paintDashHero(); paintMiniMarket(); paintOvStats();
    }
    if (active === 'portfolio' && renderers.portfolio) renderers.portfolio();
    if (active === 'aibot' && renderers.aibot) renderers.aibot();
  } catch { /* auth guard handles session loss */ }
}

function paintDashHero() {
  const host = $('#dash-hero');
  if (active !== 'overview') { host.innerHTML = ''; return; }
  const u = state.user || {};
  const d = state.dashboard;
  const firstName = u.firstName || (u.name || '').split(' ')[0] || u.email || 'there';
  const kyc = d?.profile?.kycStatus || u.kycStatus || 'unverified';
  const acct = d?.profile?.accountType || u.accountType || 'Account';
  const balance = d ? d.summary.balance : (u.balance ?? 0);
  const invested = d ? d.summary.activeInvested : 0;
  const roi = d ? d.summary.totalRoiEarned : 0;
  host.innerHTML = `
    <div class="dash-hero">
      <video autoplay muted loop playsinline><source src="/assets/video/dashboard.mp4" type="video/mp4" /></video>
      <div class="veil"></div>
      <div class="inner">
        <div>
          <div class="muted" style="font-size:12.5px;text-transform:uppercase;letter-spacing:.6px">Good to see you</div>
          <h2>${firstName}</h2>
          <div class="chips">
            <span class="pill ${kyc === 'verified' ? 'up' : 'warn'}">${kyc === 'verified' ? '✓ Verified' : 'Verify identity'}</span>
            <span class="pill">${acct}</span>
            <span class="pill dot up">Desk live</span>
          </div>
        </div>
        <div style="text-align:right">
          <div class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.6px">Available balance</div>
          <div class="bal">${C(balance)}</div>
          <div class="muted" style="font-size:12px">${C(invested)} invested · ${C(roi)} ROI earned</div>
        </div>
      </div>
    </div>`;
}

async function pollQuotes() {
  try {
    state.quotes = await api('/market/quotes', { silent: true });
    if (active === 'trade') paintQuotes();
    if (active === 'overview') paintMiniMarket();
  } catch { /* */ }
}

function go(view) {
  active = view;
  location.hash = view;
  $$('#nav .side-link').forEach((l) => l.classList.toggle('active', l.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  $('#sidebar')?.classList.remove('open');
  $('#sidebar-backdrop')?.classList.remove('open');
  paintDashHero();
  renderers[view]?.();
}

/* ============================ NOTIFICATIONS ============================ */
function wireBell() {
  const bell = $('#bell');
  const panel = $('#notif-panel');
  bell.addEventListener('click', async (e) => {
    e.stopPropagation();
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      const { items } = await api('/me/notifications', { silent: true });
      panel.innerHTML = items.slice(0, 15).map(notifItemHtml).join('') || '<div class="empty">No notifications</div>';
      panel.insertAdjacentHTML('afterbegin', '<div class="between" style="padding:10px 15px;border-bottom:1px solid var(--border)"><b style="font-size:13px">Notifications</b><a style="font-size:12px;color:var(--brand)" id="np-all">Mark all read</a></div>');
      $('#np-all')?.addEventListener('click', async (ev) => { ev.stopPropagation(); await api('/me/notifications/read-all', { method: 'POST', silent: true }); refresh(); panel.classList.add('hidden'); });
      await api('/me/notifications/read-all', { method: 'POST', silent: true }).then(() => setTimeout(refresh, 400));
    }
  });
  document.addEventListener('click', () => panel.classList.add('hidden'));
}
const notifItemHtml = (n) => `
  <div class="notif-item ${n.read ? '' : 'unread'}">
    <span class="dot"></span>
    <div><div class="t">${n.title}</div><div class="b">${n.body || ''}</div><div class="ago">${timeAgo(n.createdAt)}</div></div>
  </div>`;

function paintBell(count, items) {
  const c = $('#bell-count');
  c.textContent = count > 9 ? '9+' : count;
  c.classList.toggle('hidden', !count);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* ---- admin pop-up messages ---- */
const POP_ICON = { info: '📣', success: '✅', warning: '⚠️', danger: '🚨' };
let popupShowing = false;
function showPopups(list = []) {
  if (popupShowing || !list.length) return;
  const p = list[0];
  popupShowing = true;
  const box = el('div');
  box.className = `popmsg popmsg--${p.level || 'info'}`;
  box.innerHTML = `
    <div class="popmsg__bar"></div>
    <div class="popmsg__ico">${POP_ICON[p.level] || '📣'}</div>
    <h3 class="popmsg__title">${esc(p.title)}</h3>
    ${p.body ? `<p class="popmsg__body">${esc(p.body)}</p>` : ''}
    <div class="popmsg__actions">
      ${p.ctaUrl ? `<a class="btn ghost sm" href="${esc(p.ctaUrl)}" target="_blank" rel="noopener noreferrer" id="pop-cta">${esc(p.ctaLabel || 'Learn more')}</a>` : ''}
      <button class="btn primary sm" id="pop-ok">Got it</button>
    </div>`;
  const m = modal(box);
  const dismiss = async () => {
    m.close();
    popupShowing = false;
    try { await api(`/me/popups/${p.id}/ack`, { method: 'POST', silent: true }); } catch { /* */ }
    const rest = list.slice(1);
    if (rest.length) setTimeout(() => showPopups(rest), 350);
  };
  box.querySelector('#pop-ok').addEventListener('click', dismiss);
  box.querySelector('#pop-cta')?.addEventListener('click', dismiss);
}

let barDismissed = new Set(JSON.parse(sessionStorage.getItem('mt5_bar_dismissed') || '[]'));
function paintNotifBar(items = []) {
  const slot = $('#notif-bar-slot');
  const pick = items.find((n) => !n.read && ['warning', 'danger', 'success'].includes(n.level) && !n.meta?.popupId && !barDismissed.has(n.id));
  if (!pick) { slot.innerHTML = ''; return; }
  slot.innerHTML = `<div class="notif-bar ${pick.level}"><span class="ico">${pick.level === 'danger' ? '⚠️' : pick.level === 'success' ? '✅' : '🔔'}</span><div><b>${pick.title}</b> — ${pick.body || ''}</div><span class="x" id="bar-x">✕</span></div>`;
  $('#bar-x').addEventListener('click', () => {
    barDismissed.add(pick.id);
    sessionStorage.setItem('mt5_bar_dismissed', JSON.stringify([...barDismissed]));
    slot.innerHTML = '';
  });
}

/* ============================ SHARED UI ============================ */
const head = (t, s) => `<div class="page-head"><h1>${t}</h1>${s ? `<p class="muted mt-1">${s}</p>` : ''}</div>`;
const statCard = (label, value, sub = '', cls = '') =>
  `<div class="card stat tight hoverable"><div class="label">${label}</div><div class="value ${cls}">${value}</div>${sub ? `<div class="sub muted">${sub}</div>` : ''}</div>`;
const sectionLabel = (t) => `<div class="muted mt-3" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.9px;font-weight:600;margin-bottom:10px">${t}</div>`;

const TX_LABEL = {
  deposit: 'Deposit', withdrawal: 'Withdrawal', investment: 'Investment', roi: 'ROI payout',
  referral: 'Referral bonus', trade_pnl: 'Trade settlement', admin_credit: 'MT5 Smart Market credit', admin_debit: 'MT5 Smart Market debit',
};
function txLabel(t) {
  if (t.meta?.kind === 'bot_stake') return 'AI bot stake';
  if (t.meta?.kind === 'bot_return') return 'AI bot payout';
  if (t.type === 'trade_pnl' && t.meta?.kind === 'robot') return 'AI bot trade';
  return TX_LABEL[t.type] || t.type;
}
function txSign(t) {
  if (['deposit', 'roi', 'referral', 'admin_credit'].includes(t.type)) return '+';
  if (t.type === 'investment' && ['principal_return', 'cancel_refund', 'bot_return'].includes(t.meta?.kind)) return '+';
  if (['withdrawal', 'investment', 'admin_debit'].includes(t.type)) return '−';
  return '';
}
/**
 * Status shown to the user. Deposits and withdrawals only ever read as
 * "Pending" (submitted) or "Processing" (settled) — plus Rejected / Cancelled
 * if that happens. All other transaction types keep their real status.
 */
function userStatus(t) {
  if (t.type === 'deposit' || t.type === 'withdrawal') {
    if (t.status === 'pending') return 'pending';
    if (t.status === 'approved' || t.status === 'completed') return 'processing';
    return t.status; // rejected / cancelled
  }
  return t.status;
}
const statusTag = (t) => { const s = userStatus(t); return `<span class="tag ${s}">${s}</span>`; };
function txRow(t, clickable = true) {
  const sub = t.type === 'deposit' || t.type === 'withdrawal' ? (t.method || '') : (t.note || t.method || '');
  return `<tr class="${clickable ? 'clickable' : ''}" ${clickable ? `data-tx="${t.id}"` : ''}>
    <td><b>${txLabel(t)}</b>${sub ? `<div class="faint" style="font-size:12px">${sub}</div>` : ''}</td>
    <td class="mono">${txSign(t)}${C(t.amount)}</td>
    <td>${statusTag(t)}</td>
    <td class="faint nowrap">${fmtDate(t.createdAt)}</td>
  </tr>`;
}
function wireTxRows(root) {
  root.querySelectorAll('[data-tx]').forEach((r) => r.addEventListener('click', () => openTx(r.dataset.tx)));
}
async function openTx(id) {
  let t;
  try { t = await api(`/me/transactions/${id}`, { silent: true }); } catch { return; }
  const rows = [
    ['Reference', t.id],
    ['Type', txLabel(t)],
    ['Amount', `${txSign(t)}${C(t.amount)}`],
    ['Status', statusTag(t)],
    ['Method', t.method || '—'],
    ['Network', t.meta?.network || '—'],
    ['Deposit address', t.meta?.depositAddress || '—'],
    ['From address', t.meta?.fromAddress || '—'],
    ['Destination', t.meta?.bank ? '—' : (t.meta?.destination || '—')],
    ['Tx hash / ref', t.meta?.bank ? '—' : (t.reference || '—')],
    ['Fee', t.meta?.fee != null ? C(t.meta.fee) : '—'],
    ['You receive', t.meta?.netAmount != null ? C(t.meta.netAmount) : '—'],
    ['Balance after', t.balanceAfter != null ? C(t.balanceAfter) : '—'],
    ['Note', t.note || ''],
    ['Created', fmtDate(t.createdAt)],
    ['Processed', t.processedAt ? fmtDate(t.processedAt) : '—'],
  ].filter(([k, v]) => (v !== '—' && v !== '') || ['Method', 'Status'].includes(k));
  const bank = t.meta?.bank;
  const bankRows = bank ? [
    ['Account holder', bank.accountHolder], ['Bank', bank.bankName], ['Bank country', bank.bankCountry],
    ['Account number', bank.accountNumber], ['SWIFT / routing', bank.swift], ['IBAN', bank.iban],
    ['Account currency', bank.currency], ['Bank address', bank.bankAddress], ['Reference', bank.reference],
  ].filter(([, x]) => x) : [];
  const box = el('div');
  box.innerHTML = `<div class="between"><h3>Transaction</h3>${statusTag(t)}</div>
    <div class="mt-2">${rows.map(([k, v]) => `<div class="detail-row"><span class="dk">${k}</span><span class="dv mono">${v}</span></div>`).join('')}</div>
    ${bankRows.length ? `<h4 class="mt-3" style="font-size:13px">Bank transfer details</h4><div class="mt-1">${bankRows.map(([k, x]) => `<div class="detail-row"><span class="dk">${k}</span><span class="dv mono">${x}</span></div>`).join('')}</div>` : ''}
    ${t.proofFiles?.length ? `<h4 class="mt-3" style="font-size:13px">Payment proof</h4><div class="mt-1">${t.proofFiles.map((f) => `<a class="file-chip" href="${f.url}" target="_blank">📎 ${f.originalName}</a>`).join('')}</div>` : ''}
    ${t.status === 'pending' && (t.type === 'deposit' || t.type === 'withdrawal') ? `<button class="btn danger block mt-3" id="tx-cancel">Cancel this ${t.type} request</button>` : ''}`;
  const m = modal(box);
  box.querySelector('#tx-cancel')?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Cancel this ${t.type} request?${t.type === 'withdrawal' ? ' The reserved amount is returned to your balance.' : ''}`, { title: `Cancel ${t.type}`, confirmText: 'Cancel request', danger: true }))) return;
    try {
      await api(`/wallet/${t.type === 'deposit' ? 'deposit' : 'withdraw'}/${t.id}/cancel`, { method: 'POST' });
      toast('Request cancelled'); m.close(); await refresh();
      if (renderers[active]) renderers[active]();
    } catch { /* */ }
  });
}

/** dropzone that collects File objects; returns { element, files: () => File[] } */
function makeDropzone(label = 'Drop images / PDF here or click to browse', accept = 'image/*,application/pdf') {
  const wrap = el('div');
  const input = el('input', { type: 'file', multiple: 'true', accept, style: 'display:none' });
  const zone = el('div', { class: 'dropzone' }, label);
  const list = el('div', { class: 'mt-1' });
  let files = [];
  const render = () => {
    list.innerHTML = '';
    files.forEach((f, i) => {
      const chip = el('span', { class: 'file-chip' }, `📎 ${f.name}`, el('span', { class: 'rm', onclick: () => { files.splice(i, 1); render(); } }, '✕'));
      list.append(chip);
    });
  };
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { files = files.concat([...input.files]); input.value = ''; render(); });
  ['dragover', 'dragenter'].forEach((e) => zone.addEventListener(e, (ev) => { ev.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((e) => zone.addEventListener(e, () => zone.classList.remove('drag')));
  zone.addEventListener('drop', (ev) => { ev.preventDefault(); files = files.concat([...ev.dataTransfer.files]); render(); });
  wrap.append(zone, list);
  return { element: wrap, files: () => files };
}

async function postForm(path, fields, files, fileField) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== '') fd.append(k, v); });
  (files || []).forEach((f) => fd.append(fileField, f));
  const headers = {};
  if (store.token) headers.Authorization = `Bearer ${store.token}`;
  const res = await fetch(`/api${path}`, { method: 'POST', headers, credentials: 'include', body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) { toast(json?.error?.message || 'Upload failed', 'error'); throw new Error('form'); }
  return json.data;
}

/* ============================ VIEWS ============================ */
const renderers = {};

/* ---- OVERVIEW ---- */
renderers.overview = () => {
  const d = state.dashboard; if (!d) return;
  const s = d.summary;
  const v = $('#view-overview');
  v.innerHTML = `
    ${d.profile.kycStatus !== 'verified' ? `<div class="notif-bar warning"><span class="ico">🪪</span><div>Verify your identity to unlock withdrawals. <a style="color:var(--brand);cursor:pointer" data-goto="verification">Start verification →</a></div></div>` : ''}
    <div id="ov-stats"></div>

    ${sectionLabel('Live chart')}
    <div class="grid ov-grid" id="ov-chart-grid">
      <div class="card tight">
        <div class="between" style="margin-bottom:10px"><h3 id="ov-chart-title">EUR / USD</h3>
          <select class="input" id="ov-chart-sym" style="max-width:150px;padding:7px 30px 7px 12px;font-size:12.5px"></select>
        </div>
        <div class="tv-wrap short" id="ov-chart"></div>
      </div>
      <div class="card">
        <div class="between"><h3>Markets</h3><button class="btn sm ghost" data-goto="trade">Trade</button></div>
        <div id="ov-market" class="mt-2 grid" style="gap:2px"></div>
      </div>
    </div>

    <div class="grid cols-2 mt-3">
      <div class="card">
        <div class="between"><h3>Active investments</h3><button class="btn sm ghost" data-goto="myinvestments">View all</button></div>
        <div id="ov-active" class="mt-2"></div>
      </div>
      <div class="card">
        <div class="between"><h3>Recent transactions</h3><button class="btn sm ghost" data-goto="transactions">View all</button></div>
        <div class="table-wrap mt-2"><table><thead><tr><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
        <tbody id="ov-tx">${d.recentTransactions.map((t) => txRow(t)).join('') || '<tr><td colspan="4" class="empty">No activity yet</td></tr>'}</tbody></table></div>
      </div>
    </div>`;
  paintOvStats();
  v.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));
  wireTxRows(v);

  const symSel = $('#ov-chart-sym');
  const syms = state.quotes.length ? state.quotes.map((q) => q.symbol) : Object.keys(TV_SYMBOLS);
  symSel.innerHTML = syms.map((x) => `<option>${x}</option>`).join('');
  symSel.value = state.chartSym || syms[0];
  const drawOv = () => { state.chartSym = symSel.value; $('#ov-chart-title').textContent = symSel.value; mountChart('ov-chart', symSel.value, { interval: '60' }); };
  symSel.addEventListener('change', drawOv);
  drawOv();

  $('#ov-active').innerHTML = d.investments.length
    ? d.investments.map((i) => `
      <div style="padding:12px 0;border-bottom:1px solid var(--border)">
        <div class="between"><b>${i.planName}</b><span class="mono">${C(i.amount)}</span></div>
        <div class="progress mt-1"><span style="width:${i.progressPercent}%"></span></div>
        <div class="between faint mt-1" style="font-size:12px"><span>${i.progressPercent}% · ${i.payoutsCount} payouts</span><span>+${C(i.accruedTotal)} earned</span></div>
      </div>`).join('')
    : '<div class="empty">No active investments yet.</div>';
  paintMiniMarket();
};

function paintOvStats() {
  const box = $('#ov-stats'); const d = state.dashboard; if (!box || !d) return;
  const s = d.summary;
  box.innerHTML = `
    ${sectionLabel('Snapshot')}
    <div class="grid cols-4">
      ${statCard('Available balance', C(s.balance))}
      ${statCard('Active investments', C(s.activeInvested), `${s.activeInvestments} running`)}
      ${statCard('ROI earned', C(s.totalRoiEarned), 'paid to wallet', 'up')}
      ${statCard('Pending deposits', C(s.pendingDeposits), 'awaiting approval', s.pendingDeposits ? 'warn' : '')}
    </div>
    <div class="grid cols-4 mt-3">
      ${statCard('Total deposited', C(s.totalDeposited))}
      ${statCard('Total withdrawn', C(s.totalWithdrawn))}
      ${statCard('Referral income', C(s.referralEarned), `${d.referrals.totalReferred} invited`)}
      ${statCard('Trade P&L', C(s.tradePnl), 'net realised + open', s.tradePnl >= 0 ? 'up' : 'down')}
    </div>
    <div class="row wrap mt-3" style="gap:10px">
      <button class="btn primary" data-goto="deposit">Deposit funds</button>
      <button class="btn" data-goto="invest">Start an investment</button>
      <button class="btn" data-goto="trade">Open trading desk</button>
      <button class="btn ghost" data-goto="withdraw">Withdraw</button>
    </div>
    ${d.robot ? `<div class="notif-bar mt-3"><span class="ico">🤖</span><div>Your <b>${d.robot.name}</b> is trading — ${d.robot.stats.trades} trade(s), profit <b class="${d.robot.stats.netPnl >= 0 ? 'up' : 'down'}">${C(d.robot.stats.netPnl)}</b> of ${C(d.robot.targetProfit)} target · ${d.robot.timeProgressPercent}% of time elapsed. <a style="color:var(--brand);cursor:pointer" data-goto="aibot">Open AI bot →</a></div></div>` : ''}`;
  box.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));
}

function paintMiniMarket() {
  const box = $('#ov-market'); if (!box) return;
  box.innerHTML = (state.quotes.slice(0, 6)).map((q) => {
    const up = (q.change ?? 0) >= 0;
    return `<div class="between" style="font-size:13px"><span class="mono">${q.symbol}</span><span class="mono ${up ? 'up' : 'down'}">${fmtNum(q.price, q.price >= 100 ? 2 : 5)}</span></div>`;
  }).join('') || '<div class="faint" style="font-size:13px">Loading quotes…</div>';
}

/* ---- PORTFOLIO ---- */
renderers.portfolio = async () => {
  const v = $('#view-portfolio');
  v.innerHTML = head('Portfolio', 'Your total position across cash, investments and trades.') + '<div class="empty">Loading…</div>';
  let p;
  try { p = await api('/me/portfolio', { silent: true }); } catch { return; }
  const maxAlloc = Math.max(...p.allocation.map((a) => a.value), 1);
  const curve = p.curve.slice(-40);
  const cmax = Math.max(...curve.map((c) => c.balance), 1);
  const cmin = Math.min(...curve.map((c) => c.balance), 0);
  const spark = curve.length > 1
    ? `<svg viewBox="0 0 100 30" preserveAspectRatio="none" style="width:100%;height:70px">
        <polyline fill="none" stroke="var(--brand)" stroke-width="1.2" points="${curve.map((c, i) => `${(i / (curve.length - 1)) * 100},${30 - ((c.balance - cmin) / (cmax - cmin || 1)) * 28}`).join(' ')}" />
      </svg>`
    : '<div class="faint" style="font-size:12px">Not enough history yet.</div>';

  v.innerHTML = `
    ${head('Portfolio', 'Your total position across cash, investments and trades.')}
    <div class="grid cols-4">
      ${statCard('Total equity', C(p.totalEquity))}
      ${statCard('ROI earned', C(p.performance.roiEarned), '', 'up')}
      ${statCard('Realised trade P&L', C(p.performance.realisedTradePnl), '', p.performance.realisedTradePnl >= 0 ? 'up' : 'down')}
      ${statCard('Net contributions', C(p.performance.netContributions), 'deposits − withdrawals')}
    </div>
    <div class="grid cols-2 mt-3">
      <div class="card"><h3>Allocation</h3>
        <div class="mt-2">${p.allocation.map((a) => `
          <div style="margin-bottom:12px"><div class="between" style="font-size:13px"><span>${a.label}</span><span class="mono">${C(a.value)}</span></div>
          <div class="progress mt-1"><span style="width:${(a.value / maxAlloc) * 100}%"></span></div></div>`).join('') || '<div class="empty">Nothing allocated yet</div>'}</div>
      </div>
      <div class="card"><h3>Equity trend</h3><div class="mt-2">${spark}</div>
        <div class="grid cols-2 mt-2" style="gap:8px">
          <div class="kv"><span class="k">Unrealised P&L</span><span class="mono ${p.performance.unrealisedTradePnl >= 0 ? 'up' : 'down'}">${C(p.performance.unrealisedTradePnl)}</span></div>
          <div class="kv"><span class="k">Referral earned</span><span class="mono">${C(p.performance.referralEarned)}</span></div>
        </div>
      </div>
    </div>
    <div class="card mt-3"><h3>Holdings — investments</h3>
      <div class="table-wrap mt-2"><table><thead><tr><th>Plan</th><th>Staked</th><th>Earned</th><th>Progress</th><th>Ends</th></tr></thead>
      <tbody>${p.holdings.investments.map((h) => `<tr><td>${h.name}</td><td class="mono">${C(h.staked)}</td><td class="mono up">+${C(h.earned)}</td><td>${h.progressPercent}%</td><td class="faint">${fmtDay(h.endsAt)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No active investments</td></tr>'}</tbody></table></div>
    </div>
    <div class="card mt-3"><h3>Holdings — open trades</h3>
      <div class="table-wrap mt-2"><table><thead><tr><th>Symbol</th><th>Side</th><th>Lots</th><th>Entry</th><th>Live</th><th>P&L</th></tr></thead>
      <tbody>${p.holdings.openTrades.map((h) => `<tr><td class="mono">${h.symbol}</td><td>${h.side}</td><td class="mono">${fmtNum(h.lots, 2)}</td><td class="mono">${fmtNum(h.entryPrice, 5)}</td><td class="mono">${fmtNum(h.livePrice, 5)}</td><td class="mono ${h.livePnl >= 0 ? 'up' : 'down'}">${C(h.livePnl)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No open trades</td></tr>'}</tbody></table></div>
    </div>`;
};

/* ---- INVEST ---- */
renderers.invest = async () => {
  const v = $('#view-invest');
  v.innerHTML = head('Investment plans', 'Stake from your available balance — ROI is credited automatically on schedule.') + '<div class="grid cols-2" id="plan-list"><div class="empty">Loading…</div></div>';
  try { state.plans = await api('/plans', { silent: true }); } catch { return; }
  const bal = state.dashboard?.summary.balance ?? 0;
  $('#plan-list').innerHTML = state.plans.map((p) => `
    <div class="card">
      <div class="between"><h3>${p.name}</h3><span class="pill up">${fmtNum(p.roiPercent, 2)}% / ${p.periodHours}h</span></div>
      <p class="muted mt-1" style="font-size:13.5px">${p.description}</p>
      <div class="grid cols-2 mt-2" style="gap:10px">
        <div class="kv"><span class="k">Range</span><span>${C(p.minAmount)} – ${C(p.maxAmount)}</span></div>
        <div class="kv"><span class="k">Term</span><span>${p.durationDays} days</span></div>
        <div class="kv"><span class="k">Payout</span><span>every ${p.periodHours}h</span></div>
        <div class="kv"><span class="k">Capital</span><span>${p.principalReturn ? 'returned at end' : 'reinvested'}</span></div>
      </div>
      <form class="mt-2 invest-form" data-plan="${p.id}" data-roi="${p.roiPercent}" data-period="${p.periodHours}" data-days="${p.durationDays}">
        <div class="row">
          <input class="input mono" name="amount" type="number" min="${p.minAmount}" max="${p.maxAmount}" step="any" placeholder="Amount" required />
          <button class="btn primary nowrap" type="submit">Invest</button>
        </div>
        <div class="faint mt-1 est" style="font-size:12px"></div>
      </form>
    </div>`).join('');
  v.insertAdjacentHTML('afterbegin', `<div class="notif-bar"><span class="ico">💰</span><div>Available to invest: <b>${C(bal)}</b>. Need more? <a style="color:var(--brand);cursor:pointer" data-goto="deposit">Deposit →</a></div></div>`);
  v.querySelector('[data-goto]')?.addEventListener('click', (e) => go(e.target.dataset.goto));
  $$('.invest-form').forEach((f) => {
    const est = f.querySelector('.est');
    f.amount.addEventListener('input', () => {
      const amt = Number(f.amount.value || 0);
      if (!amt) return (est.textContent = '');
      const periods = Math.round((Number(f.dataset.days) * 24) / Number(f.dataset.period));
      const per = (amt * Number(f.dataset.roi)) / 100;
      est.textContent = `≈ ${C(per)} per payout · ${C(per * periods)} projected over ${periods} payouts`;
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('button'); btn.disabled = true;
      try {
        await api('/investments', { method: 'POST', body: { planId: f.dataset.plan, amount: Number(f.amount.value) } });
        toast('Investment started', 'info'); await refresh(); go('myinvestments');
      } catch { /* */ } finally { btn.disabled = false; }
    });
  });
};

/* ---- MY INVESTMENTS ---- */
renderers.myinvestments = async () => {
  const v = $('#view-myinvestments');
  v.innerHTML = head('My investments') + '<div id="pf"><div class="empty">Loading…</div></div>';
  let list;
  try { list = await api('/investments', { silent: true }); } catch { return; }
  if (!list.length) { $('#pf').innerHTML = '<div class="card"><div class="empty">No investments yet.<br><button class="btn primary sm mt-2" id="pf-go">Browse plans</button></div></div>'; $('#pf-go').onclick = () => go('invest'); return; }
  $('#pf').innerHTML = `<div class="grid cols-2">${list.map((i) => `
    <div class="card">
      <div class="between"><h3>${i.planName}</h3><span class="tag ${i.status}">${i.status}</span></div>
      <div class="stat mt-1"><div class="value" style="font-size:20px">${C(i.amount)}</div><div class="sub muted">${fmtNum(i.roiPercent, 2)}% every ${i.periodHours}h</div></div>
      <div class="progress mt-2"><span style="width:${i.progressPercent}%"></span></div>
      <div class="grid cols-2 mt-2" style="gap:8px">
        <div class="kv"><span class="k">ROI earned</span><span class="up mono">+${C(i.accruedTotal)}</span></div>
        <div class="kv"><span class="k">Payouts</span><span>${i.payoutsCount}</span></div>
        <div class="kv"><span class="k">Started</span><span>${fmtDay(i.startedAt)}</span></div>
        <div class="kv"><span class="k">Ends</span><span>${fmtDay(i.endsAt)}</span></div>
      </div>
      ${i.status === 'active' ? `<button class="btn danger sm block mt-2" data-cancel="${i.id}">Cancel (return principal)</button>` : ''}
    </div>`).join('')}</div>`;
  v.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('Accrued ROI stays paid; your principal is returned to your wallet.', { title: 'Cancel investment', confirmText: 'Cancel investment', danger: true }))) return;
    try { await api(`/investments/${b.dataset.cancel}/cancel`, { method: 'POST' }); toast('Cancelled'); await refresh(); renderers.myinvestments(); } catch { /* */ }
  }));
};

/* ---- AI TRADING BOT ---- */
function botProgress(bot) {
  return `
    <div class="grid cols-2" style="gap:14px">
      <div>
        <div class="between" style="font-size:12px"><span class="muted">Profit toward target</span><span class="mono">${C(bot.stats.netPnl)} / ${C(bot.targetProfit)}</span></div>
        <div class="progress mt-1"><span style="width:${bot.profitProgressPercent}%"></span></div>
        <div class="faint mt-1" style="font-size:11.5px">${bot.currentProfitPercent >= 0 ? '+' : ''}${fmtNum(bot.currentProfitPercent, 2)}% of stake</div>
      </div>
      <div>
        <div class="between" style="font-size:12px"><span class="muted">Time elapsed</span><span class="mono">${bot.timeProgressPercent}%</span></div>
        <div class="progress mt-1"><span style="width:${bot.timeProgressPercent}%"></span></div>
        <div class="faint mt-1" style="font-size:11.5px">Ends ${fmtDate(bot.endsAt)}</div>
      </div>
    </div>`;
}

renderers.aibot = async () => {
  const v = $('#view-aibot');
  v.innerHTML = head('MT5 AI Trading Bot', 'Let the AI trade for you. Choose how long it runs and the profit you want — your stake plus the profit is returned when it finishes.') + '<div class="empty">Loading…</div>';
  let d;
  try { d = await api('/me/ai-bot', { silent: true }); } catch { return; }
  const cfg = d.config;

  if (!cfg.enabled) {
    v.innerHTML = head('MT5 AI Trading Bot') + '<div class="card"><div class="empty">The AI trading bot is currently unavailable. Please check back soon.</div></div>';
    return;
  }

  const explain = `
    <div class="card"><h3>How the MT5 AI bot works</h3>
      <ol class="muted mt-2" style="padding-left:18px;display:grid;gap:8px;font-size:13px">
        <li><b>Pick your plan.</b> Choose how many days the bot should trade and the profit target you want it to reach.</li>
        <li><b>Set your stake.</b> The amount is moved from your available balance into the bot while it runs.</li>
        <li><b>The AI trades automatically</b> across FX, metals, indices and crypto — you get an alert for every trade.</li>
        <li><b>It finishes</b> the moment it hits your profit target, or when the duration ends — whichever comes first.</li>
        <li><b>You're paid out.</b> Your original stake plus all profit is credited back to your available balance.</li>
      </ol>
      <p class="faint mt-2" style="font-size:12px">Automated trading carries risk. The AI bot can never lose more than the stake you commit.</p>
    </div>`;

  if (d.active) {
    const b = d.active;
    v.innerHTML = `
      ${head('MT5 AI Trading Bot', 'Your bot is live and trading.')}
      <div class="card">
        <div class="between"><h3>${b.name}</h3><span class="tag active">running</span></div>
        <div class="grid cols-4 mt-2">
          ${statCard('Stake', C(b.stake))}
          ${statCard('Profit so far', C(b.stats.netPnl), `${b.currentProfitPercent >= 0 ? '+' : ''}${fmtNum(b.currentProfitPercent, 2)}%`, b.stats.netPnl >= 0 ? 'up' : 'down')}
          ${statCard('Target', C(b.targetProfit), `${b.profitTargetPercent}%`)}
          ${statCard('Trades', b.stats.trades, `${b.stats.wins}W / ${b.stats.losses}L`)}
        </div>
        <div class="mt-3">${botProgress(b)}</div>
        <div class="notif-bar mt-3"><span class="ico">📈</span><div>Projected payout right now: <b>${C(b.projectedValue)}</b> (stake ${C(b.stake)} ${b.stats.netPnl >= 0 ? '+' : ''}${C(b.stats.netPnl)} profit). It's credited to your balance when the bot finishes.</div></div>
        <button class="btn danger block mt-2" id="bot-stop">Stop bot now &amp; withdraw stake + profit</button>
      </div>
      ${explain}
      <div class="card mt-3"><h3>Recent bot trades</h3><div class="table-wrap mt-2"><table><thead><tr><th>Symbol</th><th>Side</th><th>Lots</th><th>P&L</th><th>Time</th></tr></thead>
        <tbody>${(d.trades || []).length ? d.trades.map((t) => `<tr>
          <td class="mono">${t.symbol}</td><td>${t.side}</td><td class="mono">${fmtNum(t.lots, 2)}</td>
          <td class="mono ${t.pnl >= 0 ? 'up' : 'down'}">${t.pnl >= 0 ? '+' : ''}${C(t.pnl)}</td>
          <td class="faint nowrap">${fmtDate(t.closedAt)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">No trades yet — the first one is on its way</td></tr>'}</tbody></table></div></div>`;
    $('#bot-stop').addEventListener('click', async () => {
      if (!(await confirmDialog(`Stop the bot now? Your stake (${C(b.stake)}) plus the current profit (${C(b.stats.netPnl)}) — ${C(b.projectedValue)} — is credited to your balance.`, { title: 'Stop AI bot', confirmText: 'Stop & withdraw', danger: true }))) return;
      try { await api('/me/ai-bot/stop', { method: 'POST' }); toast('Bot stopped — funds returned to your balance', 'info'); await refresh(); renderers.aibot(); } catch { /* */ }
    });
    return;
  }

  // no active bot — show the config chooser
  v.innerHTML = `
    ${head('MT5 AI Trading Bot', 'Set it up in seconds. The AI does the rest.')}
    <div class="grid cols-2">
      <div class="card">
        <h3>Start your AI bot</h3>
        <form id="bot-form" class="mt-2">
          <div class="field"><label>Trading duration</label>
            <select class="input" name="durationDays" id="bot-dur">${cfg.durationDays.map((n) => `<option value="${n}">${n} day${n > 1 ? 's' : ''}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Profit target</label>
            <select class="input" name="profitTargetPercent" id="bot-tgt">${cfg.profitTargets.map((n) => `<option value="${n}">${n}% of stake</option>`).join('')}</select>
          </div>
          <div class="field"><label>Stake amount (${state.currency})</label>
            <input class="input mono" name="stake" id="bot-stake" type="number" min="${cfg.minStake}" max="${cfg.maxStake}" step="any" required placeholder="${cfg.minStake} – ${cfg.maxStake}" />
            <span class="hint">Available balance: ${C(d.balance)}. Min ${C(cfg.minStake)} · Max ${C(cfg.maxStake)}.</span>
          </div>
          <div class="card tight mt-1" style="background:var(--bg-1)">
            <div class="kv"><span class="k">Target profit</span><span class="mono up" id="bot-est-profit">—</span></div>
            <div class="kv"><span class="k">Projected payout</span><span class="mono" id="bot-est-payout">—</span></div>
            <div class="kv"><span class="k">Runs until</span><span id="bot-est-ends">—</span></div>
          </div>
          <button class="btn primary block mt-2" type="submit" ${d.balance <= 0 ? 'disabled' : ''}>Activate AI bot</button>
          ${d.balance <= 0 ? '<p class="faint mt-1" style="font-size:12px">Fund your account to start the bot. <a style="color:var(--brand);cursor:pointer" data-goto="deposit">Deposit →</a></p>' : ''}
        </form>
      </div>
      ${explain}
    </div>
    ${d.history.length ? `<div class="card mt-3"><h3>Your past bot runs</h3><div class="table-wrap mt-2"><table><thead><tr><th>Plan</th><th>Stake</th><th>Result</th><th>Trades</th><th>Finished</th></tr></thead>
      <tbody>${d.history.map((h) => `<tr>
        <td>${h.durationDays}-day · ${h.profitTargetPercent}%</td>
        <td class="mono">${C(h.stake)}</td>
        <td class="mono ${h.stats.netPnl >= 0 ? 'up' : 'down'}">${h.stats.netPnl >= 0 ? '+' : ''}${C(h.stats.netPnl)} (${fmtNum(h.currentProfitPercent, 1)}%)</td>
        <td>${h.stats.trades}</td>
        <td class="faint nowrap">${h.completedAt ? fmtDate(h.completedAt) : '—'}<div class="faint" style="font-size:11px">${h.completionReason || ''}</div></td>
      </tr>`).join('')}</tbody></table></div></div>` : ''}`;
  v.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));

  const form = $('#bot-form');
  const recalc = () => {
    const stake = Number($('#bot-stake').value || 0);
    const tgt = Number($('#bot-tgt').value);
    const dur = Number($('#bot-dur').value);
    const profit = (stake * tgt) / 100;
    $('#bot-est-profit').textContent = stake ? `+${C(profit)}` : '—';
    $('#bot-est-payout').textContent = stake ? C(stake + profit) : '—';
    $('#bot-est-ends').textContent = dur ? new Date(Date.now() + dur * 864e5).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  };
  ['bot-stake', 'bot-tgt', 'bot-dur'].forEach((id) => $(`#${id}`).addEventListener('input', recalc));
  recalc();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button'); btn.disabled = true;
    try {
      await api('/me/ai-bot', { method: 'POST', body: {
        durationDays: Number(form.durationDays.value),
        profitTargetPercent: Number(form.profitTargetPercent.value),
        stake: Number(form.stake.value),
      } });
      toast('AI bot activated — it will start trading shortly', 'info');
      await refresh(); renderers.aibot();
    } catch { btn.disabled = false; }
  });
};

/* ---- TRADE ---- */
renderers.trade = async () => {
  const v = $('#view-trade');
  const bal = state.dashboard?.summary.balance ?? 0;
  const robot = state.dashboard?.robot;
  v.innerHTML = `
    ${head('Trading desk', 'Multi-asset execution — FX, metals, indices and crypto. Charts by TradingView.')}
    ${robot ? `<div class="notif-bar"><span class="ico">🤖</span><div>Your <b>${robot.name}</b> is running — ${robot.stats.trades} trade(s), profit <b class="${robot.stats.netPnl >= 0 ? 'up' : 'down'}">${C(robot.stats.netPnl)}</b> of ${C(robot.targetProfit)} target. <a style="color:var(--brand);cursor:pointer" data-goto="aibot">Manage AI bot →</a></div></div>` : ''}
    ${bal <= 0 ? `<div class="notif-bar warning"><span class="ico">💰</span><div>You need a funded balance to open a trade. <a style="color:var(--brand);cursor:pointer" data-goto="deposit">Deposit funds →</a></div></div>` : ''}
    <div class="tv-wrap tall bleed" id="tv-chart" style="margin-bottom:18px;border-left:0;border-right:0;border-radius:0"></div>
    <div class="grid trade-grid">
      <div class="card">
        <div class="between"><h3>Market watch</h3><span class="faint" style="font-size:12px">updates every 5s</span></div>
        <div class="table-wrap mt-2"><table><thead><tr><th>Symbol</th><th>Price</th><th>Move</th><th></th></tr></thead><tbody id="q-body"></tbody></table></div>
      </div>
      <div class="card">
        <h3>New position</h3>
        <div class="field mt-1"><label>Symbol</label><select class="input" id="t-symbol"></select></div>
        <div class="field"><label>Direction</label>
          <div class="seg" id="t-side"><button type="button" data-side="buy" class="buy active">Buy / Long</button><button type="button" data-side="sell" class="sell">Sell / Short</button></div>
        </div>
        <div class="row">
          <div class="field" style="flex:1"><label>Lots</label><input class="input mono" id="t-lots" type="number" min="0.01" step="0.01" value="0.5" /></div>
          <div class="field" style="flex:1"><label>Leverage</label><select class="input" id="t-lev"><option>5</option><option>10</option><option selected>20</option><option>50</option><option>100</option></select></div>
        </div>
        <div class="kv"><span class="k">Est. margin</span><span class="mono" id="t-margin">—</span></div>
        <div class="kv"><span class="k">Notional</span><span class="mono" id="t-notional">—</span></div>
        <button class="btn primary block mt-2" id="t-open" ${bal <= 0 ? 'disabled' : ''}>Open position</button>
      </div>
    </div>
    <div class="card mt-3"><h3>Open positions</h3><div class="table-wrap mt-2"><table><thead><tr><th>Symbol</th><th>Side</th><th>Lots</th><th>Entry</th><th>Live</th><th>P&L</th><th></th></tr></thead><tbody id="open-body"></tbody></table></div></div>
    <div class="card mt-3"><h3>Trade history</h3><div class="table-wrap mt-2"><table><thead><tr><th>Symbol</th><th>Side</th><th>Lots</th><th>Entry</th><th>Exit</th><th>P&L</th><th>Closed</th></tr></thead><tbody id="hist-body"></tbody></table></div></div>`;

  if (!state.quotes.length) { try { state.quotes = await api('/market/quotes', { silent: true }); } catch { /* */ } }
  const sel = $('#t-symbol');
  sel.innerHTML = state.quotes.map((q) => `<option value="${q.symbol}">${q.symbol} — ${q.name}</option>`).join('');
  sel.value = state.chartSym && state.quotes.some((q) => q.symbol === state.chartSym) ? state.chartSym : sel.value;
  $('#t-side').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.tradeSide = b.dataset.side;
    $('#t-side').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    estMargin();
  }));
  ['t-lots', 't-lev'].forEach((id) => $(`#${id}`).addEventListener('input', estMargin));
  sel.addEventListener('change', () => { state.chartSym = sel.value; estMargin(); mountChart('tv-chart', sel.value, { interval: '60', tall: true }); });
  $('#t-open').addEventListener('click', openPosition);
  v.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));
  mountChart('tv-chart', sel.value, { interval: '60', tall: true });
  paintQuotes(); await loadTrades(); estMargin();
};

function estMargin() {
  const q = state.quotes.find((x) => x.symbol === $('#t-symbol')?.value);
  const lots = Number($('#t-lots')?.value || 0);
  const lev = Number($('#t-lev')?.value || 1);
  if (!q || !lots || !$('#t-margin')) return;
  const notional = q.price * lots * 1000;
  $('#t-margin').textContent = C(notional / lev);
  $('#t-notional').textContent = C(notional);
}
function paintQuotes() {
  const body = $('#q-body'); if (!body) return;
  body.innerHTML = state.quotes.map((q) => {
    const up = (q.change ?? 0) >= 0;
    return `<tr><td class="mono"><b>${q.symbol}</b></td><td class="mono">${fmtNum(q.price, q.price >= 100 ? 2 : 5)}</td><td class="${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs((q.change ?? 0) * 100).toFixed(2)}%</td><td><button class="btn sm ghost" data-pick="${q.symbol}">Trade</button></td></tr>`;
  }).join('');
  body.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { const sel = $('#t-symbol'); sel.value = b.dataset.pick; sel.dispatchEvent(new Event('change')); }));
}
async function loadTrades() {
  let trades; try { trades = await api('/trades', { silent: true }); } catch { return; }
  const open = trades.filter((t) => t.status === 'open');
  const hist = trades.filter((t) => t.status === 'closed');
  $('#open-body').innerHTML = open.length ? open.map((t) => `<tr>
    <td class="mono">${t.symbol}</td><td><span class="tag ${t.side === 'buy' ? 'open' : 'closed'}">${t.side}</span></td>
    <td class="mono">${fmtNum(t.lots, 2)}</td><td class="mono">${fmtNum(t.entryPrice, 5)}</td><td class="mono">${fmtNum(t.livePrice, 5)}</td>
    <td class="mono ${t.livePnl >= 0 ? 'up' : 'down'}">${t.livePnl >= 0 ? '+' : ''}${C(t.livePnl)}</td>
    <td><button class="btn sm danger" data-close="${t.id}">Close</button></td></tr>`).join('') : '<tr><td colspan="7" class="empty">No open positions</td></tr>';
  $('#hist-body').innerHTML = hist.length ? hist.map((t) => `<tr>
    <td class="mono">${t.symbol}</td><td>${t.side}</td><td class="mono">${fmtNum(t.lots, 2)}</td><td class="mono">${fmtNum(t.entryPrice, 5)}</td>
    <td class="mono">${fmtNum(t.exitPrice, 5)}</td><td class="mono ${t.pnl >= 0 ? 'up' : 'down'}">${t.pnl >= 0 ? '+' : ''}${C(t.pnl)}</td>
    <td class="faint nowrap">${fmtDate(t.closedAt)}</td></tr>`).join('') : '<tr><td colspan="7" class="empty">No closed trades yet</td></tr>';
  $$('#open-body [data-close]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { const r = await api(`/trades/${b.dataset.close}/close`, { method: 'POST' }); toast(`Closed · P&L ${C(r.pnl)}`, r.pnl >= 0 ? 'info' : 'warn'); await refresh(); await loadTrades(); } catch { b.disabled = false; }
  }));
}
async function openPosition() {
  if ((state.dashboard?.summary.balance ?? 0) <= 0) {
    return toast('You need a funded balance to trade. Please make a deposit first.', 'warn');
  }
  const btn = $('#t-open'); btn.disabled = true;
  try {
    await api('/trades', { method: 'POST', body: { symbol: $('#t-symbol').value, side: state.tradeSide, lots: Number($('#t-lots').value), leverage: Number($('#t-lev').value) } });
    toast('Position opened'); await refresh(); await loadTrades();
  } catch { /* */ } finally { btn.disabled = false; }
}

/* ---- DEPOSIT ---- */
renderers.deposit = async () => {
  const v = $('#view-deposit');
  v.innerHTML = head('Deposit funds', 'Submit your deposit below. It shows as Pending, then Processing once received.') + '<div class="empty">Loading…</div>';
  let info;
  try { info = await api('/wallet/info', { silent: true }); } catch { return; }
  const crypto = info.cryptoMethods || [];
  const bank = info.bankDeposit || {};
  v.innerHTML = `
    ${head('Deposit funds', 'Submit your deposit below. It shows as Pending, then Processing once received.')}
    <div class="notif-bar warning"><span class="ico">⏳</span><div>Your deposit will show as <b>Pending</b> until it is <b>Processing</b>. Referral bonuses pay out on your first processed deposit.</div></div>
    <div class="tabs" id="dep-tabs">
      <button class="active" data-tab="crypto">Crypto</button>
      ${bank.enabled ? '<button data-tab="bank">Bank transfer</button>' : ''}
    </div>
    <div id="dep-crypto">
      <div class="grid cols-2">
        <div class="card">
          <h3>1. Choose a coin &amp; network</h3>
          <div class="field mt-2"><label>Payment method</label>
            <select class="input" id="dep-method">${crypto.map((m) => `<option value="${m.id}" ${m.address ? '' : 'disabled'}>${m.symbol} — ${m.network}${m.address ? '' : ' (unavailable)'}</option>`).join('')}</select>
          </div>
          <div id="dep-address"></div>
        </div>
        <div class="card">
          <h3>2. Enter details &amp; upload proof</h3>
          <form id="dep-form" class="mt-2">
            <div class="field"><label>Amount you sent (${state.currency})</label><input class="input mono" name="amount" type="number" min="1" step="any" required /></div>
            <div class="field"><label>Your sending wallet address <span class="hint">optional</span></label><input class="input" name="fromAddress" placeholder="Where you sent from" /></div>
            <div class="field"><label>Transaction hash / ID <span class="hint">optional but speeds things up</span></label><input class="input" name="txHash" placeholder="0x… / tx id" /></div>
            <div class="field"><label>Payment proof (screenshot or PDF)</label><div id="dep-drop"></div></div>
            <button class="btn primary block mt-1" type="submit">Submit deposit</button>
          </form>
        </div>
      </div>
    </div>
    <div id="dep-bank" class="hidden">
      <div class="grid cols-2">
        <div class="card"><h3>Bank details</h3>
          <div class="mt-2">
            ${[['Bank', bank.bankName], ['Account name', bank.accountName], ['Account number', bank.accountNumber], ['IBAN', bank.iban], ['SWIFT/BIC', bank.swift], ['Reference', bank.reference]].filter(([, x]) => x).map(([k, x]) => `<div class="detail-row"><span class="dk">${k}</span><span class="dv mono">${x}</span></div>`).join('') || '<div class="empty">Bank details not configured yet — please use crypto.</div>'}
          </div>
          ${bank.instructions ? `<p class="muted mt-2" style="font-size:12.5px">${bank.instructions}</p>` : ''}
        </div>
        <div class="card"><h3>Confirm your transfer</h3>
          <form id="depb-form" class="mt-2">
            <div class="field"><label>Amount transferred (${state.currency})</label><input class="input mono" name="amount" type="number" min="1" step="any" required /></div>
            <div class="field"><label>Bank reference used <span class="hint">optional</span></label><input class="input" name="reference" placeholder="Reference / sender name" /></div>
            <div class="field"><label>Payment proof (receipt / PDF)</label><div id="depb-drop"></div></div>
            <button class="btn primary block mt-1" type="submit">Submit deposit</button>
          </form>
        </div>
      </div>
    </div>
    <div class="card mt-3"><h3>Your deposits</h3><div class="table-wrap mt-2"><table><thead><tr><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody id="dep-hist"></tbody></table></div></div>`;

  const drop = makeDropzone();
  $('#dep-drop').append(drop.element);
  const dropB = makeDropzone();
  $('#depb-drop').append(dropB.element);

  const renderAddress = () => {
    const m = crypto.find((x) => x.id === $('#dep-method').value);
    if (!m) { $('#dep-address').innerHTML = '<div class="empty">No methods available. Please check back soon.</div>'; return; }
    $('#dep-address').innerHTML = `
      <div class="detail-row"><span class="dk">Send exactly</span><span class="dv">${m.symbol} on <b>${m.network}</b></span></div>
      <div class="detail-row"><span class="dk">Min deposit</span><span class="dv mono">${m.minDeposit} ${m.symbol}</span></div>
      <div class="detail-row"><span class="dk">Confirmations</span><span class="dv">${m.confirmations}</span></div>
      <div class="mt-2"><label class="hint">Deposit address — tap to copy</label>
        <div class="copy-code mt-1" id="copy-addr">${m.address || '—'}<b class="up">copy</b></div></div>
      ${m.memo ? `<div class="mt-1"><label class="hint">Memo / destination tag</label><div class="copy-code mt-1" id="copy-memo">${m.memo}<b class="up">copy</b></div></div>` : ''}
      ${m.instructions ? `<p class="warn mt-2" style="font-size:12px">⚠️ ${m.instructions}</p>` : ''}`;
    $('#copy-addr')?.addEventListener('click', () => { navigator.clipboard?.writeText(m.address); toast('Address copied', 'info', 1200); });
    $('#copy-memo')?.addEventListener('click', () => { navigator.clipboard?.writeText(m.memo); toast('Memo copied', 'info', 1200); });
  };
  $('#dep-method').addEventListener('change', renderAddress);
  renderAddress();

  $$('#dep-tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('#dep-tabs button').forEach((x) => x.classList.toggle('active', x === b));
    $('#dep-crypto').classList.toggle('hidden', b.dataset.tab !== 'crypto');
    $('#dep-bank').classList.toggle('hidden', b.dataset.tab !== 'bank');
  }));

  $('#dep-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      const f = Object.fromEntries(new FormData(e.target));
      await postForm('/wallet/deposit/crypto', { methodId: $('#dep-method').value, ...f }, drop.files(), 'proof');
      toast('Deposit submitted — Pending', 'info');
      await refresh(); renderers.deposit();
    } catch { btn.disabled = false; }
  });
  $('#depb-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      const f = Object.fromEntries(new FormData(e.target));
      await postForm('/wallet/deposit/bank', f, dropB.files(), 'proof');
      toast('Deposit submitted — Pending', 'info');
      await refresh(); renderers.deposit();
    } catch { btn.disabled = false; }
  });
  loadDepHist();
};
async function loadDepHist() {
  try {
    const { data } = await api('/me/transactions?type=deposit&limit=50', { silent: true });
    const body = $('#dep-hist');
    body.innerHTML = data.length ? data.map((t) => txRow(t)).join('') : '<tr><td colspan="4" class="empty">No deposits yet</td></tr>';
    wireTxRows(body);
  } catch { /* */ }
}

/* ---- WITHDRAW ---- */
renderers.withdraw = async () => {
  const v = $('#view-withdraw');
  v.innerHTML = head('Withdraw funds') + '<div class="empty">Loading…</div>';
  let info;
  try { info = await api('/wallet/info', { silent: true }); } catch { return; }
  const cfg = state.cfg || (state.cfg = await api('/config', { silent: true }).catch(() => ({ countries: [], currencies: [] })));
  const s = state.dashboard.summary;
  const kycOk = !info.requireKycForWithdrawal || info.kyc.status === 'verified';
  const dis = kycOk ? '' : 'disabled';
  const wallets = info.wallets || [];
  const limitLine = `Minimum ${C(info.minWithdrawal)}${info.maxWithdrawal ? ` · Maximum ${C(info.maxWithdrawal)} per request` : ''} · ${info.withdrawalFeePercent}% processing fee`;

  v.innerHTML = `
    ${head('Withdraw funds', `${limitLine} · shows as Pending, then Processing.`)}
    ${!kycOk ? `<div class="notif-bar danger"><span class="ico">⚠️</span><div>Identity verification is required before withdrawing. <a style="color:var(--brand);cursor:pointer" data-goto="verification">Verify now →</a></div></div>` : ''}
    <div class="grid cols-2">
      <div class="card">
        <div class="kv"><span class="k">Available balance</span><span class="mono">${C(s.balance)}</span></div>
        <div class="kv"><span class="k">Pending withdrawals</span><span class="mono">${C(s.pendingWithdrawals)}</span></div>
        <div class="kv"><span class="k">Total withdrawn</span><span class="mono">${C(s.totalWithdrawn)}</span></div>

        <form id="wd-form" class="mt-2">
          <div class="field"><label>Amount (${state.currency})</label>
            <input class="input mono" name="amount" type="number" min="${info.minWithdrawal}" ${info.maxWithdrawal ? `max="${info.maxWithdrawal}"` : ''} step="any" required ${dis} placeholder="e.g. 9000" />
          </div>

          <div class="field"><label>Withdrawal method</label>
            <select class="input" id="wd-method" ${dis}>
              <option value="bank">Bank transfer (international)</option>
              <option value="crypto">Cryptocurrency</option>
              ${wallets.map((w) => `<option value="wallet:${w.id}">Saved wallet — ${w.label} (${w.network})</option>`).join('')}
            </select>
          </div>

          <!-- BANK -->
          <div id="wd-bank">
            <div class="row">
              <div class="field" style="flex:1"><label>Account holder name</label><input class="input" name="accountHolder" placeholder="As it appears on the account" ${dis} /></div>
              <div class="field" style="flex:1"><label>Bank name</label><input class="input" name="bankName" placeholder="e.g. Barclays" ${dis} /></div>
            </div>
            <div class="row">
              <div class="field" style="flex:1"><label>Bank country</label>
                <select class="input" name="bankCountry" ${dis}><option value="">Select country…</option>${(cfg.countries || []).map((c) => `<option ${c === (state.user.country || '') ? 'selected' : ''}>${c}</option>`).join('')}</select>
              </div>
              <div class="field" style="flex:1"><label>Account currency <span class="hint">optional</span></label>
                <select class="input" name="bankCurrency" ${dis}><option value="">—</option>${(cfg.currencies || []).map((c) => `<option value="${c.code}">${c.code} — ${c.name}</option>`).join('')}</select>
              </div>
            </div>
            <div class="row">
              <div class="field" style="flex:1"><label>Account number</label><input class="input mono" name="accountNumber" placeholder="Account number" ${dis} /></div>
              <div class="field" style="flex:1"><label>SWIFT / BIC or routing no.</label><input class="input mono" name="swiftRouting" placeholder="e.g. BARCGB22 / 021000021" ${dis} /></div>
            </div>
            <div class="field"><label>IBAN <span class="hint">if your country uses it</span></label><input class="input mono" name="iban" placeholder="e.g. GB29 NWBK 6016 1331 9268 19" ${dis} /></div>
            <div class="field"><label>Bank address <span class="hint">optional</span></label><input class="input" name="bankAddress" placeholder="Branch address" ${dis} /></div>
            <div class="field"><label>Reference for the transfer <span class="hint">optional</span></label><input class="input" name="reference" placeholder="Shown on your statement" ${dis} /></div>
          </div>

          <!-- CRYPTO -->
          <div id="wd-crypto" class="hidden">
            <div class="row">
              <div class="field" style="flex:1"><label>Coin</label><select class="input" name="coin"><option>BTC</option><option>ETH</option><option>USDT</option><option>USDC</option><option>BNB</option><option>SOL</option><option>TRX</option><option>LTC</option></select></div>
              <div class="field" style="flex:1"><label>Network</label><input class="input" name="network" placeholder="e.g. TRC20 / ERC20 / Bitcoin" ${dis} /></div>
            </div>
            <div class="field"><label>Wallet address</label><input class="input mono" name="cryptoAddress" placeholder="Paste destination address" ${dis} /></div>
          </div>

          <div id="wd-wallet" class="hidden"><p class="muted" style="font-size:12.5px" id="wd-wallet-info"></p></div>

          <div class="faint est mt-1" style="font-size:12px"></div>
          <button class="btn primary block mt-2" type="submit" ${dis}>Request withdrawal</button>
        </form>
      </div>

      <div class="card"><h3>How withdrawals work</h3>
        <ol class="muted mt-2" style="padding-left:18px;display:grid;gap:8px;font-size:13px">
          <li>Submit a request — the amount is <b>reserved</b> from your balance immediately and shows as <b>Pending</b>.</li>
          <li>Once it moves to <b>Processing</b>, your payout is on the way, minus the ${info.withdrawalFeePercent}% fee.</li>
          <li>Bank transfers go via SWIFT/wire and can take 1–5 business days to land, depending on the country.</li>
          <li>If a request is rejected or cancelled, the full amount is <b>refunded</b> to your balance.</li>
        </ol>
        <p class="muted mt-2" style="font-size:12.5px">Save crypto addresses under <a style="color:var(--brand);cursor:pointer" data-goto="wallets">Linked Wallets</a> for faster crypto withdrawals.</p>
      </div>
    </div>
    <div class="card mt-3"><h3>Your withdrawals</h3><div class="table-wrap mt-2"><table><thead><tr><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody id="wd-hist"></tbody></table></div></div>`;
  v.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));

  const form = $('#wd-form');
  const est = form.querySelector('.est');
  const recalc = () => {
    const a = Number(form.amount.value || 0);
    const fee = (a * info.withdrawalFeePercent) / 100;
    est.textContent = a ? `Fee ${C(fee)} · you receive ${C(a - fee)}` : '';
  };
  form.amount?.addEventListener('input', recalc);

  const methodSel = $('#wd-method');
  const show = (id) => ['wd-bank', 'wd-crypto', 'wd-wallet'].forEach((x) => $(`#${x}`).classList.toggle('hidden', x !== id));
  methodSel.addEventListener('change', () => {
    const m = methodSel.value;
    if (m === 'bank') show('wd-bank');
    else if (m === 'crypto') show('wd-crypto');
    else {
      const w = wallets.find((x) => `wallet:${x.id}` === m);
      $('#wd-wallet-info').textContent = w ? `Sending to ${w.label}: ${w.network} · ${w.address}` : '';
      show('wd-wallet');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button'); btn.disabled = true;
    try {
      const f = Object.fromEntries(new FormData(form));
      const body = { amount: Number(f.amount) };
      const m = methodSel.value;
      if (m === 'bank') {
        body.method = 'Bank transfer';
        Object.assign(body, {
          bank: {
            accountHolder: f.accountHolder, bankName: f.bankName, bankCountry: f.bankCountry,
            bankCurrency: f.bankCurrency, accountNumber: f.accountNumber, swiftRouting: f.swiftRouting,
            iban: f.iban, bankAddress: f.bankAddress, reference: f.reference,
          },
        });
      } else if (m === 'crypto') {
        body.method = f.coin || 'Crypto';
        body.network = f.network;
        body.destination = f.cryptoAddress;
      } else {
        body.walletId = m.slice(7);
        body.method = 'Crypto wallet';
      }
      await api('/wallet/withdraw', { method: 'POST', body });
      toast('Withdrawal requested — Pending', 'info');
      await refresh(); renderers.withdraw();
    } catch { btn.disabled = false; }
  });
  loadWdHist();
};
async function loadWdHist() {
  try {
    const { data } = await api('/me/transactions?type=withdrawal&limit=50', { silent: true });
    const body = $('#wd-hist');
    body.innerHTML = data.length ? data.map((t) => txRow(t)).join('') : '<tr><td colspan="4" class="empty">No withdrawals yet</td></tr>';
    wireTxRows(body);
  } catch { /* */ }
}

/* ---- TRANSACTIONS ---- */
renderers.transactions = async () => {
  const v = $('#view-transactions');
  v.innerHTML = `${head('Transactions', 'Click any row to see the full detail.')}
    <div class="card">
      <div class="tabs" id="tx-filter">${['all', 'deposit', 'withdrawal', 'investment', 'roi', 'referral', 'trade_pnl'].map((t, i) => `<button data-t="${t}" class="${i === 0 ? 'active' : ''}">${t === 'all' ? 'All' : (TX_LABEL[t] || t)}</button>`).join('')}</div>
      <div class="table-wrap"><table><thead><tr><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody id="tx-body"><tr><td colspan="4" class="empty">Loading…</td></tr></tbody></table></div>
    </div>`;
  const load = async (type) => {
    const q = type && type !== 'all' ? `?type=${type}&limit=200` : '?limit=200';
    try {
      const { data } = await api(`/me/transactions${q}`, { silent: true });
      const body = $('#tx-body');
      body.innerHTML = data.length ? data.map((t) => txRow(t)).join('') : '<tr><td colspan="4" class="empty">Nothing here</td></tr>';
      wireTxRows(body);
    } catch { /* */ }
  };
  v.querySelectorAll('#tx-filter button').forEach((b) => b.addEventListener('click', () => {
    v.querySelectorAll('#tx-filter button').forEach((x) => x.classList.toggle('active', x === b));
    load(b.dataset.t);
  }));
  load('all');
};

/* ---- LINKED WALLETS ---- */
renderers.wallets = async () => {
  const v = $('#view-wallets');
  v.innerHTML = head('Linked crypto wallets', 'Save withdrawal addresses so you don’t re-type them. MT5 Smart Market can verify a wallet as trusted.') + '<div class="empty">Loading…</div>';
  let data;
  try { data = await api('/wallets', { silent: true }); } catch { return; }
  v.innerHTML = `
    ${head('Linked crypto wallets', 'Save withdrawal addresses so you don’t re-type them.')}
    <div class="grid cols-2">
      <div class="card"><h3>Add a wallet</h3>
        <form id="wl-form" class="mt-2">
          <div class="field"><label>Label</label><input class="input" name="label" placeholder="e.g. My Ledger" required /></div>
          <div class="row">
            <div class="field" style="flex:1"><label>Network</label><select class="input" name="network" required>${data.networks.map((n) => `<option>${n}</option>`).join('')}</select></div>
            <div class="field" style="flex:1"><label>Asset <span class="hint">optional</span></label><input class="input" name="asset" placeholder="BTC" /></div>
          </div>
          <div class="field"><label>Wallet address</label><input class="input" name="address" placeholder="Paste address" required /></div>
          <button class="btn primary block" type="submit">Link wallet</button>
        </form>
      </div>
      <div class="card"><h3>Your wallets</h3>
        <div class="mt-2" id="wl-list">${data.items.length ? data.items.map((w) => `
          <div style="padding:12px 0;border-bottom:1px solid var(--border)">
            <div class="between"><b>${w.label} ${w.verified ? '<span class="tag verified">verified</span>' : ''}</b><span class="rm faint clickable" data-rm="${w.id}" style="cursor:pointer">Remove</span></div>
            <div class="faint mono" style="font-size:12px;word-break:break-all">${w.network} · ${w.address}</div>
          </div>`).join('') : '<div class="empty">No wallets linked</div>'}</div>
      </div>
    </div>`;
  $('#wl-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try { await api('/wallets', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Wallet linked', 'info'); renderers.wallets(); } catch { /* */ } finally { btn.disabled = false; }
  });
  v.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('Remove this linked wallet? You can add it again later.', { title: 'Remove wallet', confirmText: 'Remove', danger: true }))) return;
    try { await api(`/wallets/${b.dataset.rm}`, { method: 'DELETE' }); toast('Removed'); renderers.wallets(); } catch { /* */ }
  }));
};

/* ---- VERIFICATION (KYC) ---- */
renderers.verification = async () => {
  const v = $('#view-verification');
  v.innerHTML = head('Identity verification') + '<div class="empty">Loading…</div>';
  let kyc; let cfg = state.cfg;
  try { kyc = await api('/kyc', { silent: true }); if (!cfg) cfg = await api('/config', { silent: true }); } catch { return; }
  const st = kyc.status;
  const badge = { unverified: 'unverified', pending: 'pending', verified: 'verified', rejected: 'rejected' }[st];
  v.innerHTML = `
    ${head('Identity verification', 'Verify your identity to lift withdrawal limits and secure your account.')}
    <div class="card">
      <div class="between"><h3>Status</h3><span class="tag ${badge}">${st}</span></div>
      ${st === 'verified' ? '<p class="up mt-2">✓ Your identity is verified. No further action needed.</p>' : ''}
      ${st === 'pending' ? '<p class="warn mt-2">⏳ Your documents are under review.</p>' : ''}
      ${kyc.submission?.reviewNote ? `<p class="muted mt-1" style="font-size:13px">Reviewer note: ${kyc.submission.reviewNote}</p>` : ''}
      ${kyc.submission?.documents?.length ? `<div class="mt-2">${kyc.submission.documents.map((f) => `<a class="file-chip" href="${f.url}" target="_blank">📎 ${f.originalName}</a>`).join('')}</div>` : ''}
    </div>
    ${['unverified', 'rejected'].includes(st) ? `
    <div class="card mt-3"><h3>Submit documents</h3>
      <form id="kyc-form" class="mt-2">
        <div class="field"><label>Document type</label><select class="input" name="documentType" required>${cfg.kycDocumentTypes.map((d) => `<option>${d}</option>`).join('')}</select></div>
        <div class="field"><label>Document number <span class="hint">optional</span></label><input class="input" name="documentNumber" placeholder="Passport / ID number" /></div>
        <div class="field"><label>Upload photos or PDF (front &amp; back / selfie)</label><div id="kyc-drop"></div></div>
        <button class="btn primary block mt-1" type="submit">Submit for review</button>
      </form>
    </div>` : ''}`;
  if (['unverified', 'rejected'].includes(st)) {
    const drop = makeDropzone('Drop ID photos / PDF here or click to browse');
    $('#kyc-drop').append(drop.element);
    $('#kyc-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!drop.files().length) return toast('Upload at least one document', 'warn');
      const btn = e.target.querySelector('button'); btn.disabled = true;
      try {
        await postForm('/kyc', Object.fromEntries(new FormData(e.target)), drop.files(), 'documents');
        toast('Documents submitted for review', 'info'); await refresh(); renderers.verification();
      } catch { btn.disabled = false; }
    });
  }
};

/* ---- NOTIFICATIONS ---- */
renderers.notifications = async () => {
  const v = $('#view-notifications');
  v.innerHTML = head('Notifications') + '<div class="empty">Loading…</div>';
  let data;
  try { data = await api('/me/notifications', { silent: true }); } catch { return; }
  v.innerHTML = `
    ${head('Notifications', `${data.unread} unread`)}
    <div class="card">
      <div class="between"><h3>All notifications</h3><button class="btn sm ghost" id="n-all">Mark all read</button></div>
      <div class="mt-2">${data.items.length ? data.items.map((n) => `
        <div class="notif-item ${n.read ? '' : 'unread'}">
          <span class="dot"></span>
          <div style="flex:1"><div class="t">${n.title}</div><div class="b">${n.body || ''}</div><div class="ago">${fmtDate(n.createdAt)} · ${n.type}</div></div>
          <span class="faint clickable" data-del="${n.id}" style="cursor:pointer">✕</span>
        </div>`).join('') : '<div class="empty">No notifications yet</div>'}</div>
    </div>`;
  $('#n-all').addEventListener('click', async () => { await api('/me/notifications/read-all', { method: 'POST' }); await refresh(); renderers.notifications(); });
  v.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    try { await api(`/me/notifications/${b.dataset.del}`, { method: 'DELETE' }); await refresh(); renderers.notifications(); } catch { /* */ }
  }));
};

/* ---- REFERRALS ---- */
renderers.referrals = async () => {
  const v = $('#view-referrals');
  let r; try { r = await api('/me/referrals', { silent: true }); } catch { return; }
  const code = state.user.referralCode;
  const link = `${location.origin}/register?ref=${code}`;
  const pct = state.dashboard?.wallet ? '' : '';
  v.innerHTML = `
    ${head('Referral programme', 'Earn a percentage of every invited user’s first deposit.')}
    <div class="grid cols-3">
      ${statCard('Total referred', r.totalReferred)}
      ${statCard('Bonuses paid', r.paidCount, `${r.pendingCount} pending`)}
      ${statCard('Referral income', C(r.totalEarned), '', 'up')}
    </div>
    <div class="card mt-3"><h3>Your invite link</h3>
      <div class="row mt-2 wrap"><span class="copy-code" id="cp-link">${link}<b class="up">copy</b></span><span class="copy-code" id="cp-code">Code: ${code}<b class="up">copy</b></span></div>
    </div>
    <div class="card mt-3"><h3>Referred users</h3>
      <div class="table-wrap mt-2"><table><thead><tr><th>User</th><th>Joined</th><th>Status</th><th>Bonus</th></tr></thead>
      <tbody>${r.referred.length ? r.referred.map((x) => `<tr><td><b>${x.name}</b><div class="faint" style="font-size:12px">${x.email}</div></td><td class="faint">${fmtDay(x.joinedAt)}</td><td><span class="tag ${x.status}">${x.status}</span></td><td class="mono">${C(x.bonusAmount)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">No referrals yet</td></tr>'}</tbody></table></div>
    </div>`;
  $('#cp-link').onclick = () => { navigator.clipboard?.writeText(link); toast('Link copied', 'info', 1200); };
  $('#cp-code').onclick = () => { navigator.clipboard?.writeText(code); toast('Code copied', 'info', 1200); };
};

/* ---- PROFILE ---- */
renderers.profile = async () => {
  const v = $('#view-profile');
  const cfg = state.cfg || (state.cfg = await api('/config', { silent: true }));
  let p;
  try { p = await api('/me/profile', { silent: true }); } catch { return; }
  state.user = { ...state.user, ...p };
  const isAdmin = p.role === 'admin';
  v.innerHTML = `
    ${head('Profile')}
    <div class="card">
      <div class="row" style="align-items:center;gap:16px">
        <div class="avatar-lg">${(p.firstName || '?').charAt(0).toUpperCase()}</div>
        <div>
          <div style="font-size:1.15rem;font-weight:700">${p.firstName} ${p.lastName}</div>
          <div class="faint">${p.email}</div>
          <div class="row mt-1" style="gap:6px"><span class="tag ${p.status}">${p.status}</span><span class="tag ${p.kycStatus}">KYC: ${p.kycStatus}</span><span class="pill">${p.accountType || '—'}</span></div>
        </div>
      </div>
    </div>
    <div class="grid cols-2 mt-3">
      <div class="card"><h3>Personal information</h3>
        <form id="pf-personal" class="mt-2">
          <div class="row"><div class="field" style="flex:1"><label>First name</label><input class="input" name="firstName" value="${p.firstName || ''}" required /></div>
          <div class="field" style="flex:1"><label>Last name</label><input class="input" name="lastName" value="${p.lastName || ''}" required /></div></div>
          <div class="row"><div class="field" style="flex:1"><label>Phone</label><input class="input" name="phone" value="${p.phone || ''}" /></div>
          <div class="field" style="flex:1"><label>Date of birth</label><input class="input" type="date" name="dateOfBirth" value="${p.dateOfBirth || ''}" /></div></div>
          <div class="field"><label>Country</label><select class="input" name="country">${cfg.countries.map((c) => `<option ${c === p.country ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div class="field"><label>Address line 1</label><input class="input" name="addressLine1" value="${p.addressLine1 || ''}" /></div>
          <div class="field"><label>Address line 2</label><input class="input" name="addressLine2" value="${p.addressLine2 || ''}" /></div>
          <div class="row"><div class="field" style="flex:1"><label>City</label><input class="input" name="city" value="${p.city || ''}" /></div>
          <div class="field" style="flex:1"><label>State / Province</label><input class="input" name="stateProvince" value="${p.stateProvince || ''}" /></div>
          <div class="field" style="flex:1"><label>Postal code</label><input class="input" name="postalCode" value="${p.postalCode || ''}" /></div></div>
          <button class="btn primary block" type="submit">Save personal info</button>
        </form>
      </div>
      <div class="card"><h3>Account preferences</h3>
        <form id="pf-prefs" class="mt-2">
          <div class="field"><label>Preferred currency</label>
            <select class="input" name="currency">${cfg.currencies.map((c) => `<option value="${c.code}" ${c.code === p.currency ? 'selected' : ''}>${c.code} — ${c.name}</option>`).join('')}</select>
            <span class="hint">Amounts across the app are shown in this currency.</span>
          </div>
          <div class="field"><label>Account type</label><select class="input" name="accountType">${cfg.accountTypes.map((t) => `<option ${t === p.accountType ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <button class="btn primary block" type="submit">Save preferences</button>
        </form>
        <div class="mt-3">
          <div class="kv"><span class="k">Referral code</span><span class="mono">${p.referralCode}</span></div>
          <div class="kv"><span class="k">Member since</span><span>${fmtDay(p.createdAt)}</span></div>
          <div class="kv"><span class="k">Approved</span><span>${p.approvedAt ? fmtDay(p.approvedAt) : '—'}</span></div>
          <div class="kv"><span class="k">Last login</span><span>${p.lastLoginAt ? fmtDate(p.lastLoginAt) : '—'}</span></div>
          <div class="kv"><span class="k">Security question set</span><span>${p.hasSecurityQuestion ? 'Yes' : 'No'}</span></div>
        </div>
      </div>
    </div>
    <div class="card mt-3"><h3>Sign-in email &amp; password</h3>
      <p class="muted mt-1" style="font-size:13px">Change the email address and password you use to log in. Leave a field blank to keep it unchanged.</p>
      <form id="pf-login" class="mt-2 grid cols-2" style="gap:14px 20px">
        <div class="field"><label>New sign-in email</label><input class="input" type="email" name="newEmail" placeholder="Current: ${p.email}" autocomplete="off" /></div>
        <div class="field"><label>New password</label><input class="input" type="password" name="newPassword" minlength="8" placeholder="At least 8 characters" autocomplete="new-password" /></div>
        <div class="field"><label>Confirm new password</label><input class="input" type="password" name="confirm" minlength="8" autocomplete="new-password" /></div>
        ${isAdmin ? '' : `<div class="field"><label>Current password</label><input class="input" type="password" name="currentPassword" autocomplete="current-password" /><span class="hint">Required to confirm the change.</span></div>`}
        <div style="grid-column:1/-1"><button class="btn primary block" type="submit">Update sign-in details</button></div>
      </form>
    </div>`;
  $('#pf-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const newEmail = f.newEmail.value.trim();
    const newPassword = f.newPassword.value;
    const currentPassword = f.currentPassword ? f.currentPassword.value : '';
    if (!newEmail && !newPassword) return toast('Enter a new email or a new password', 'error');
    if (newPassword && newPassword !== f.confirm.value) return toast('New passwords do not match', 'error');
    if (!isAdmin && !currentPassword) return toast('Enter your current password to confirm', 'error');
    const btn = f.querySelector('button'); btn.disabled = true;
    try {
      if (newEmail) await api('/auth/change-email', { method: 'POST', body: { currentPassword, newEmail } });
      if (newPassword) await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      toast('Sign-in details updated — use them next time you log in', 'info', 6000);
      await refresh();
      renderers.profile();
    } catch { /* api() surfaces the message */ } finally { btn.disabled = false; }
  });
  $('#pf-personal').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try { await api('/me/profile', { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) }); toast('Profile updated', 'info'); } catch { /* */ } finally { btn.disabled = false; }
  });
  $('#pf-prefs').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      const updated = await api('/me/profile', { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) });
      state.currency = updated.currency; toast('Preferences updated', 'info'); await refresh();
    } catch { /* */ } finally { btn.disabled = false; }
  });
};

/* ---- SECURITY ---- */
renderers.security = async () => {
  const v = $('#view-security');
  const cfg = state.cfg || (state.cfg = await api('/config', { silent: true }));
  let history = [];
  try { history = await api('/auth/login-history', { silent: true }); } catch { /* */ }
  const p = state.user;
  v.innerHTML = `
    ${head('Security', 'Keep your account protected.')}
    <div class="grid cols-2">
      <div class="card"><h3>Change password</h3>
        <form id="sec-pw" class="mt-2">
          <div class="field"><label>Current password</label><input class="input" type="password" name="currentPassword" required /></div>
          <div class="field"><label>New password</label><input class="input" type="password" name="newPassword" minlength="8" required /></div>
          <div class="field"><label>Confirm new password</label><input class="input" type="password" name="confirm" minlength="8" required /></div>
          <button class="btn primary block" type="submit">Update password</button>
        </form>
      </div>
      <div class="card"><h3>Two-factor authentication</h3>
        <p class="muted mt-1" style="font-size:13px">When enabled, a one-time email code is required at sign-in.</p>
        <div class="between mt-2">
          <span class="pill ${p.twoFactorEnabled ? 'up' : ''}">${p.twoFactorEnabled ? 'Enabled' : 'Disabled'}</span>
          <button class="btn sm ${p.twoFactorEnabled ? 'danger' : 'primary'}" id="sec-2fa">${p.twoFactorEnabled ? 'Disable' : 'Enable'} 2FA</button>
        </div>
        <h3 class="mt-3">Security question</h3>
        <form id="sec-sq" class="mt-2">
          <div class="field"><label>Confirm current password</label><input class="input" type="password" name="currentPassword" required /></div>
          <div class="field"><label>Question</label><select class="input" name="securityQuestion" required>${cfg.securityQuestions.map((q) => `<option ${q === p.securityQuestion ? 'selected' : ''}>${q}</option>`).join('')}</select></div>
          <div class="field"><label>Answer</label><input class="input" name="securityAnswer" required minlength="2" /></div>
          <button class="btn block" type="submit">Update security question</button>
        </form>
      </div>
    </div>
    <div class="card mt-3"><h3>Recent sign-in activity</h3>
      <div class="table-wrap mt-2"><table><thead><tr><th>When</th><th>Result</th><th>IP</th><th>Device</th></tr></thead>
      <tbody>${history.length ? history.map((h) => `<tr><td class="faint nowrap">${fmtDate(h.at)}</td><td><span class="tag ${h.result === 'success' ? 'active' : 'rejected'}">${h.result}</span></td><td class="mono">${h.ip || '—'}</td><td class="faint" style="font-size:11px">${(h.userAgent || '—').slice(0, 60)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">No sign-in history</td></tr>'}</tbody></table></div>
    </div>`;
  $('#sec-pw').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.newPassword.value !== f.confirm.value) return toast('New passwords do not match', 'error');
    const btn = f.querySelector('button'); btn.disabled = true;
    try { await api('/auth/change-password', { method: 'POST', body: { currentPassword: f.currentPassword.value, newPassword: f.newPassword.value } }); toast('Password updated', 'info'); f.reset(); } catch { /* */ } finally { btn.disabled = false; }
  });
  $('#sec-2fa').addEventListener('click', async () => {
    try { await api('/auth/two-factor', { method: 'POST', body: { enabled: !p.twoFactorEnabled } }); state.user.twoFactorEnabled = !p.twoFactorEnabled; toast('2FA updated', 'info'); renderers.security(); } catch { /* */ }
  });
  $('#sec-sq').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const btn = f.querySelector('button'); btn.disabled = true;
    try { await api('/auth/security-question', { method: 'POST', body: Object.fromEntries(new FormData(f)) }); toast('Security question updated', 'info'); f.reset(); } catch { /* */ } finally { btn.disabled = false; }
  });
};
