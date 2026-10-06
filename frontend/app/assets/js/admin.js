import {
  api, toast, $, $$, el, requireAuth, logout, modal, confirmDialog, promptDialog,
  fmtMoney, fmtNum, fmtDate, fmtDay, timeAgo,
} from '/assets/js/core.js';

const state = { admin: null, base: 'USD', cfg: null, quotes: [] };
const C = (n) => fmtMoney(n, state.base);
let active = 'overview';

(async function boot() {
  const user = await requireAuth('admin');
  if (!user) return;
  state.admin = user;
  $('#admin-name').textContent = user.name;
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
  $('#run-accrual').addEventListener('click', runAccrual);
  $$('#nav .side-link').forEach((l) => l.addEventListener('click', () => go(l.dataset.view)));
  try {
    state.cfg = await api('/config', { silent: true });
    state.base = (await api('/admin/settings', { silent: true })).baseCurrency || 'USD';
    state.quotes = await api('/market/quotes', { silent: true });
  } catch { /* */ }
  await pollBadges();
  go(document.getElementById(`view-${location.hash.slice(1)}`) ? location.hash.slice(1) : 'overview');
  setInterval(pollBadges, 15000);
})();

function go(view) {
  active = view;
  location.hash = view;
  $$('#nav .side-link').forEach((l) => l.classList.toggle('active', l.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  $('#sidebar')?.classList.remove('open');
  $('#sidebar-backdrop')?.classList.remove('open');
  renderers[view]?.();
}

async function pollBadges() {
  try {
    const s = await api('/admin/stats', { silent: true });
    const set = (id, n) => { const b = $(id); b.textContent = n; b.classList.toggle('hidden', !n); };
    set('#b-users', s.pending.users);
    set('#b-req', s.pending.deposits + s.pending.withdrawals);
    set('#b-kyc', s.pending.kyc);
  } catch { /* */ }
}

async function runAccrual() {
  const btn = $('#run-accrual'); btn.disabled = true;
  try {
    const r = await api('/admin/accrual/run', { method: 'POST' });
    toast(`Accrual: ${r.payouts} payout(s) = ${C(r.paidAmount)} · ${r.completed} matured`, 'info', 5000);
    renderers[active]?.();
  } catch { /* */ } finally { btn.disabled = false; }
}

const head = (t, s) => `<div class="page-head"><h1>${t}</h1>${s ? `<p class="muted mt-1">${s}</p>` : ''}</div>`;
const stat = (l, v, sub = '', cls = '') => `<div class="card stat"><div class="label">${l}</div><div class="value ${cls}">${v}</div>${sub ? `<div class="sub muted">${sub}</div>` : ''}</div>`;
const renderers = {};

/* ---------------- OVERVIEW ---------------- */
renderers.overview = async () => {
  const v = $('#view-overview');
  v.innerHTML = head('Platform overview') + '<div class="empty">Loading…</div>';
  let s; let act;
  try { [s, act] = await Promise.all([api('/admin/stats', { silent: true }), api('/admin/activity', { silent: true })]); } catch { return; }
  v.innerHTML = `
    ${head('Platform overview', 'Live snapshot of the whole book.')}
    <div class="grid cols-4">
      ${stat('Users', s.users.total, `${s.users.active} active · ${s.users.pending} pending · ${s.users.suspended} suspended`)}
      ${stat('Total balances', C(s.money.totalBalances))}
      ${stat('Deposits', C(s.money.deposits), 'confirmed', 'up')}
      ${stat('Withdrawals', C(s.money.withdrawals), 'paid out', 'down')}
    </div>
    <div class="grid cols-4 mt-3">
      ${stat('ROI paid', C(s.money.roiPaid))}
      ${stat('Active capital', C(s.investments.capitalActive), `${s.investments.active} investments`)}
      ${stat('Realised trade P&L', C(s.trades.realisedPnl), `${s.trades.open} open`, s.trades.realisedPnl >= 0 ? 'up' : 'down')}
      ${stat('AI trading bots', s.robots?.active ?? 0, `${s.robots?.total ?? 0} total`)}
    </div>
    <div class="grid cols-4 mt-3">
      ${stat('Pending accounts', s.pending.users, 'need approval', s.pending.users ? 'warn' : '')}
      ${stat('Pending deposits', s.pending.deposits, '', s.pending.deposits ? 'warn' : '')}
      ${stat('Pending withdrawals', s.pending.withdrawals, '', s.pending.withdrawals ? 'warn' : '')}
      ${stat('KYC to review', s.pending.kyc, '', s.pending.kyc ? 'warn' : '')}
    </div>
    <div class="row wrap mt-3" style="gap:10px">
      <button class="btn primary" data-goto="approvals">Review accounts</button>
      <button class="btn" data-goto="requests">Funding requests</button>
      <button class="btn" data-goto="kyc">KYC queue</button>
    </div>
    <div class="card mt-3"><h3>Recent activity</h3>
      <div class="table-wrap mt-2"><table><thead><tr><th>User</th><th>Type</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
      <tbody>${act.map((a) => `<tr><td>${a.user?.name || '—'}<div class="faint" style="font-size:11px">${a.user?.email || ''}</div></td><td>${a.type.replace('_', ' ')}</td><td class="mono">${C(a.amount)}</td><td><span class="tag ${a.status}">${a.status}</span></td><td class="faint">${timeAgo(a.createdAt)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nothing yet</td></tr>'}</tbody></table></div>
    </div>`;
  v.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));
};

/* ---------------- PENDING ACCOUNTS ---------------- */
renderers.approvals = async () => {
  const v = $('#view-approvals');
  v.innerHTML = head('Pending accounts', 'New registrations cannot sign in until you approve them.') + '<div class="empty">Loading…</div>';
  let rows; try { rows = await api('/admin/users/pending', { silent: true }); } catch { return; }
  v.innerHTML = head('Pending accounts', 'New registrations cannot sign in until you approve them.') + `
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Country</th><th>Type</th><th>Currency</th><th>Registered</th><th>Action</th></tr></thead>
    <tbody>${rows.length ? rows.map((u) => `<tr>
      <td><b>${u.name}</b></td><td>${u.email}</td><td>${u.country || '—'}</td><td>${u.accountType || '—'}</td><td class="mono">${u.currency}</td>
      <td class="faint nowrap">${fmtDate(u.createdAt)}</td>
      <td class="nowrap"><button class="btn sm primary" data-approve="${u.id}">Approve</button> <button class="btn sm danger" data-reject="${u.id}">Reject</button></td>
    </tr>`).join('') : '<tr><td colspan="7" class="empty">No accounts awaiting approval 🎉</td></tr>'}</tbody></table></div></div>`;
  v.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
    try { await api(`/admin/users/${b.dataset.approve}/approve`, { method: 'POST' }); toast('Account approved'); pollBadges(); renderers.approvals(); } catch { /* */ }
  }));
  v.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', async () => {
    const reason = await promptDialog('This account will be rejected and the user notified.', { title: 'Reject account', placeholder: 'Reason (optional)' });
    if (reason === null) return;
    try { await api(`/admin/users/${b.dataset.reject}/reject`, { method: 'POST', body: { reason: reason || undefined } }); toast('Account rejected'); pollBadges(); renderers.approvals(); } catch { /* */ }
  }));
};

/* ---------------- FUNDING REQUESTS ---------------- */
renderers.requests = async () => {
  const v = $('#view-requests');
  v.innerHTML = head('Funding requests', 'Approve, reject or cancel deposits and withdrawals.') + '<div class="empty">Loading…</div>';
  let rows; try { rows = await api('/admin/requests', { silent: true }); } catch { return; }
  v.innerHTML = head('Funding requests', 'Approve, reject or cancel deposits and withdrawals.') + `
    <div class="card"><div class="table-wrap"><table><thead><tr><th>User</th><th>Type</th><th>Amount</th><th>Method / destination</th><th>Requested</th><th>Actions</th></tr></thead>
    <tbody>${rows.length ? rows.map(reqRow).join('') : '<tr><td colspan="6" class="empty">No pending requests 🎉</td></tr>'}</tbody></table></div></div>`;
  v.querySelectorAll('[data-tx]').forEach((b) => b.addEventListener('click', () => openTx(b.dataset.tx, true)));
  v.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); handleReq(b.dataset); }));
};
function reqRow(t) {
  return `<tr>
    <td class="clickable" data-tx="${t.id}"><b>${t.user?.name || '—'}</b><div class="faint" style="font-size:11px">${t.user?.email || ''}</div></td>
    <td><span class="tag ${t.type === 'deposit' ? 'approved' : 'pending'}">${t.type}</span></td>
    <td class="mono">${C(t.amount)}${t.meta?.fee ? `<div class="faint" style="font-size:11px">fee ${C(t.meta.fee)} → net ${C(t.meta.netAmount)}</div>` : ''}</td>
    <td>${t.method || '—'}${t.meta?.bank ? `<div class="faint" style="font-size:11px">🏦 ${t.meta.bank.bankName}, ${t.meta.bank.bankCountry} · ${t.meta.bank.accountNumber}<br>SWIFT/Routing ${t.meta.bank.swift} · <b>Click to view full details</b></div>` : `<div class="faint" style="font-size:11px;word-break:break-all">${t.meta?.destination || t.reference || ''}</div>`}${t.meta?.proofFileIds?.length ? `<span class="pill">📎 ${t.meta.proofFileIds.length} proof</span>` : ''}</td>
    <td class="faint nowrap">${fmtDate(t.createdAt)}</td>
    <td class="nowrap">
      <button class="btn sm primary" data-act="approve" data-type="${t.type}" data-id="${t.id}">Set Processing</button>
      <button class="btn sm danger" data-act="reject" data-type="${t.type}" data-id="${t.id}">Reject</button>
      <button class="btn sm ghost" data-act="cancel" data-type="${t.type}" data-id="${t.id}">Cancel</button>
    </td></tr>`;
}
async function handleReq({ act, type, id }) {
  let reason;
  if (act !== 'approve') {
    reason = await promptDialog(`This ${type} will be ${act === 'cancel' ? 'cancelled' : 'rejected'} and the user notified.`, { title: `${act[0].toUpperCase()}${act.slice(1)} ${type}`, placeholder: 'Reason (optional)' });
    if (reason === null) return;
    reason = reason || undefined;
  } else if (!(await confirmDialog(type === 'deposit'
    ? 'Set this deposit to Processing and credit the amount to the user\'s balance?'
    : 'Set this withdrawal to Processing and release the payout?', { title: 'Set Processing', confirmText: 'Set Processing' }))) {
    return;
  }
  const path = type === 'deposit' ? `/admin/deposits/${id}/${act}` : `/admin/withdrawals/${id}/${act}`;
  try { await api(path, { method: 'POST', body: { reason } }); toast(act === 'approve' ? `${type} set to Processing` : `${type} ${act}${act === 'cancel' ? 'led' : 'd'}`); pollBadges(); renderers.requests(); } catch { /* */ }
}

/* ---------------- transaction detail (admin, editable) ---------------- */
async function openTx(id, editable = false) {
  let t; try { t = await api(`/admin/transactions/${id}`, { silent: true }); } catch { return; }
  const rows = [
    ['Reference', t.id], ['User', `${t.user?.name || ''} (${t.user?.email || ''})`],
    ['Type', t.type], ['Amount', C(t.amount)], ['Status', `<span class="tag ${t.status}">${t.status}</span>`],
    ['Method', t.method || '—'], ['Network', t.meta?.network || '—'],
    ['Deposit address', t.meta?.depositAddress || '—'], ['From address', t.meta?.fromAddress || '—'],
    ['Destination', t.meta?.bank ? '—' : (t.meta?.destination || '—')], ['Tx hash / ref', t.meta?.bank ? '—' : (t.reference || '—')],
    ['Fee', t.meta?.fee != null ? C(t.meta.fee) : '—'], ['Balance after', t.balanceAfter != null ? C(t.balanceAfter) : '—'],
    ['Note', t.note || '—'], ['Created', fmtDate(t.createdAt)], ['Processed', t.processedAt ? fmtDate(t.processedAt) : '—'],
  ];
  const bank = t.meta?.bank;
  const bankRows = bank ? [
    ['Account holder', bank.accountHolder], ['Bank', bank.bankName], ['Bank country', bank.bankCountry],
    ['Account number', bank.accountNumber], ['SWIFT / routing', bank.swift], ['IBAN', bank.iban],
    ['Account currency', bank.currency], ['Bank address', bank.bankAddress], ['Reference', bank.reference],
  ].filter(([, x]) => x) : [];
  const box = el('div');
  box.innerHTML = `<div class="between"><h3>Transaction</h3><span class="tag ${t.status}">${t.status}</span></div>
    <div class="mt-2">${rows.map(([k, x]) => `<div class="detail-row"><span class="dk">${k}</span><span class="dv mono">${x}</span></div>`).join('')}</div>
    ${bankRows.length ? `<h4 class="mt-3" style="font-size:13px">🏦 Bank transfer details — pay to this account</h4><div class="mt-1">${bankRows.map(([k, x]) => `<div class="detail-row"><span class="dk">${k}</span><span class="dv mono">${x}</span></div>`).join('')}</div>` : ''}
    ${t.proofFiles?.length ? `<h4 class="mt-3" style="font-size:13px">Payment proof</h4><div class="mt-1">${t.proofFiles.map((f) => `<a class="file-chip" href="${f.url}" target="_blank">📎 ${f.originalName}</a>`).join('')}</div>` : ''}
    <h4 class="mt-3" style="font-size:13px">Edit transaction</h4>
    <form id="tx-edit" class="mt-1">
      <div class="row"><div class="field" style="flex:1"><label>Amount</label><input class="input mono" name="amount" type="number" step="any" value="${t.amount}" /></div>
      <div class="field" style="flex:1"><label>Status</label><select class="input" name="status">${['pending', 'approved', 'completed', 'rejected', 'cancelled'].map((s) => `<option ${s === t.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div>
      <div class="field"><label>Method</label><input class="input" name="method" value="${t.method || ''}" /></div>
      <div class="field"><label>Reference</label><input class="input" name="reference" value="${t.reference || ''}" /></div>
      <div class="field"><label>Note</label><input class="input" name="note" value="${t.note || ''}" /></div>
      <button class="btn primary block" type="submit">Save changes</button>
    </form>
    ${['deposit', 'withdrawal'].includes(t.type) && t.status === 'pending' ? `<div class="row mt-2"><button class="btn sm primary" id="q-approve">Approve</button><button class="btn sm danger" id="q-reject">Reject</button><button class="btn sm ghost" id="q-cancel">Cancel</button></div>` : ''}`;
  const m = modal(box);
  box.querySelector('#tx-edit').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api(`/admin/transactions/${t.id}`, { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) }); toast('Transaction updated'); m.close(); renderers[active]?.(); } catch { /* */ }
  });
  const quick = async (act) => {
    let reason;
    if (act !== 'approve') {
      reason = await promptDialog(`This ${t.type} will be ${act === 'cancel' ? 'cancelled' : 'rejected'}.`, { title: `${act[0].toUpperCase()}${act.slice(1)} ${t.type}`, placeholder: 'Reason (optional)' });
      if (reason === null) return;
      reason = reason || undefined;
    }
    const path = t.type === 'deposit' ? `/admin/deposits/${t.id}/${act}` : `/admin/withdrawals/${t.id}/${act}`;
    try { await api(path, { method: 'POST', body: { reason } }); toast(`${t.type} ${act}d`); m.close(); pollBadges(); renderers[active]?.(); } catch { /* */ }
  };
  box.querySelector('#q-approve')?.addEventListener('click', () => quick('approve'));
  box.querySelector('#q-reject')?.addEventListener('click', () => quick('reject'));
  box.querySelector('#q-cancel')?.addEventListener('click', () => quick('cancel'));
}

/* ---------------- KYC ---------------- */
let kycTab = 'pending';
function kycDocLinks(k) {
  return k.documents.length
    ? k.documents.map((f) => `<a class="file-chip" href="${f.url}" target="_blank">📎 ${f.originalName}${f.mimetype === 'application/pdf' ? ' (PDF)' : ''}</a>`).join('')
    : '<span class="faint">No files</span>';
}
renderers.kyc = async () => {
  const v = $('#view-kyc');
  v.innerHTML = head('Identity verification (KYC)', 'Every submission and its documents are kept here permanently — view them any time.') + '<div class="empty">Loading…</div>';
  let res; try { res = await api('/admin/kyc?status=all', { silent: true }); } catch { return; }
  const all = res.items || [];
  const c = res.counts || {};
  const shown = kycTab === 'all' ? all : all.filter((k) => k.status === kycTab);

  v.innerHTML = head('Identity verification (KYC)', 'Every submission and its documents are kept here permanently — view them any time, even after review or after the account is deleted.') + `
    <div class="tabs" id="kyc-tabs">
      ${[['pending', 'To review', c.pending || 0], ['verified', 'Verified', c.verified || 0], ['rejected', 'Rejected', c.rejected || 0], ['all', 'All', c.all || 0]]
        .map(([k, label, n]) => `<button data-k="${k}" class="${k === kycTab ? 'active' : ''}">${label} (${n})</button>`).join('')}
    </div>
    ${kycTab === 'pending' ? `
      <div class="grid cols-2">${shown.length ? shown.map((k) => `
        <div class="card">
          <div class="between"><h3>${k.user?.name || '—'}</h3><span class="tag pending">pending</span></div>
          <div class="faint" style="font-size:12px">${k.user?.email || ''}</div>
          <div class="mt-2">
            <div class="detail-row"><span class="dk">Document</span><span class="dv">${k.documentType}</span></div>
            <div class="detail-row"><span class="dk">Number</span><span class="dv mono">${k.documentNumber || '—'}</span></div>
            <div class="detail-row"><span class="dk">Submitted</span><span class="dv">${fmtDate(k.createdAt)}</span></div>
          </div>
          <div class="mt-2">${kycDocLinks(k)}</div>
          <div class="row mt-3"><button class="btn sm primary" data-v="${k.id}">Verify</button><button class="btn sm danger" data-r="${k.id}">Reject</button></div>
        </div>`).join('') : '<div class="empty">Nothing to review 🎉</div>'}</div>`
    : `
      <div class="card"><div class="table-wrap"><table><thead><tr><th>User</th><th>Document</th><th>Number</th><th>Status</th><th>Submitted</th><th>Reviewed</th><th>Documents</th></tr></thead>
      <tbody>${shown.length ? shown.map((k) => `<tr>
        <td>${k.user?.name || '—'}<div class="faint" style="font-size:11px">${k.user?.email || ''}</div></td>
        <td>${k.documentType}</td><td class="mono">${k.documentNumber || '—'}</td>
        <td><span class="tag ${k.status}">${k.status}</span></td>
        <td class="faint nowrap">${fmtDate(k.createdAt)}</td>
        <td class="faint nowrap" style="font-size:11px">${k.reviewedAt ? `${fmtDate(k.reviewedAt)}${k.reviewerName ? `<br>by ${k.reviewerName}` : ''}` : '—'}${k.reviewNote ? `<div class="faint">${k.reviewNote}</div>` : ''}</td>
        <td>${kycDocLinks(k)}${k.status === 'pending' ? ` <button class="btn sm primary" data-v="${k.id}">Verify</button> <button class="btn sm danger" data-r="${k.id}">Reject</button>` : ''}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="empty">No submissions</td></tr>'}</tbody></table></div></div>`}`;

  v.querySelectorAll('#kyc-tabs button').forEach((b) => b.addEventListener('click', () => { kycTab = b.dataset.k; renderers.kyc(); }));
  v.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', async () => {
    try { await api(`/admin/kyc/${b.dataset.v}/review`, { method: 'POST', body: { decision: 'verified' } }); toast('Verified — documents kept on file'); pollBadges(); renderers.kyc(); } catch { /* */ }
  }));
  v.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', async () => {
    const note = await promptDialog('The user will be asked to resubmit. Their current documents stay on file here.', { title: 'Reject verification', placeholder: 'Reason' });
    if (note === null) return;
    try { await api(`/admin/kyc/${b.dataset.r}/review`, { method: 'POST', body: { decision: 'rejected', note: note || 'Documents not acceptable' } }); toast('Rejected — documents kept on file'); pollBadges(); renderers.kyc(); } catch { /* */ }
  }));
};

/* ---------------- USERS ---------------- */
renderers.users = async () => {
  const v = $('#view-users');
  v.innerHTML = `${head('Users', 'Search, inspect and edit any account.')}
    <div class="card">
      <div class="row wrap" style="align-items:center">
        <input class="input" id="u-search" placeholder="Search name or email…" style="max-width:280px" />
        <select class="input" id="u-status" style="max-width:170px"><option value="">All statuses</option><option value="pending">Pending</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
      </div>
      <div class="table-wrap mt-2"><table><thead><tr><th>User</th><th>Balance</th><th>Invested</th><th>ROI</th><th>KYC</th><th>Status</th><th>Joined</th><th></th></tr></thead>
      <tbody id="u-body"><tr><td colspan="8" class="empty">Loading…</td></tr></tbody></table></div>
    </div>`;
  const load = async () => {
    const q = new URLSearchParams({ limit: '200' });
    if ($('#u-search').value) q.set('search', $('#u-search').value);
    if ($('#u-status').value) q.set('status', $('#u-status').value);
    try {
      const { data } = await api(`/admin/users?${q}`, { silent: true });
      const body = $('#u-body');
      body.innerHTML = data.length ? data.map((u) => `<tr class="clickable" data-user="${u.id}">
        <td><b>${u.name}</b><div class="faint" style="font-size:11px">${u.email}</div></td>
        <td class="mono">${C(u.balance)}</td><td class="mono">${C(u.summary.activeInvested)}</td><td class="mono up">${C(u.summary.totalRoiEarned)}</td>
        <td><span class="tag ${u.kycStatus}">${u.kycStatus}</span></td><td><span class="tag ${u.status}">${u.status}</span></td>
        <td class="faint nowrap">${fmtDay(u.createdAt)}</td><td><button class="btn sm ghost">Manage</button></td></tr>`).join('') : '<tr><td colspan="8" class="empty">No users</td></tr>';
      body.querySelectorAll('[data-user]').forEach((r) => r.addEventListener('click', () => openUser(r.dataset.user)));
    } catch { /* */ }
  };
  let t;
  $('#u-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  $('#u-status').addEventListener('change', load);
  load();
};

async function openUser(id) {
  let d; try { d = await api(`/admin/users/${id}`, { silent: true }); } catch { return; }
  const p = d.profile;
  const cfg = state.cfg;
  const box = el('div');
  const ta = d.tradingAccount || {};
  const robot = ta.robot;
  box.innerHTML = `
    <div class="between"><h3>${p.name}</h3><span class="tag ${p.status === 'suspended' ? 'suspended' : p.status}">${p.status === 'suspended' ? 'frozen' : p.status}</span></div>
    <div class="faint" style="font-size:12px">${p.email} · joined ${fmtDay(p.createdAt)} · ref ${p.referralCode}</div>
    <div class="grid cols-2 mt-2" style="gap:8px">
      <div class="kv"><span class="k">Balance</span><span class="mono">${C(p.balance)}</span></div>
      <div class="kv"><span class="k">Active invested</span><span class="mono">${C(p.summary.activeInvested)}</span></div>
      <div class="kv"><span class="k">ROI earned</span><span class="mono up">${C(p.summary.totalRoiEarned)}</span></div>
      <div class="kv"><span class="k">Deposited</span><span class="mono">${C(p.summary.totalDeposited)}</span></div>
      <div class="kv"><span class="k">Withdrawn</span><span class="mono">${C(p.summary.totalWithdrawn)}</span></div>
      <div class="kv"><span class="k">Pending dep.</span><span class="mono">${C(p.summary.pendingDeposits)}</span></div>
    </div>
    <div class="row wrap mt-2" style="gap:8px">
      ${p.status === 'pending' ? '<button class="btn sm primary" id="u-approve">Approve account</button>' : ''}
      ${p.role === 'admin' ? '' : p.status === 'suspended'
        ? '<button class="btn sm primary" id="u-unfreeze">Unfreeze account</button>'
        : '<button class="btn sm danger" id="u-freeze">Freeze account</button>'}
      ${p.role === 'admin' ? '' : '<button class="btn sm danger" id="u-delete">Delete account</button>'}
    </div>

    <div class="tabs mt-3" id="u-tabs">
      <button class="active" data-t="edit">Edit</button><button data-t="balance">Balance</button>
      <button data-t="trading">Trading</button>
      <button data-t="tx">Transactions</button><button data-t="inv">Investments</button><button data-t="wl">Wallets & KYC</button>
    </div>
    <div id="ut-edit">
      <form id="u-edit">
        <div class="row"><div class="field" style="flex:1"><label>First name</label><input class="input" name="firstName" value="${p.firstName || ''}" /></div>
        <div class="field" style="flex:1"><label>Last name</label><input class="input" name="lastName" value="${p.lastName || ''}" /></div></div>
        <div class="field"><label>Email</label><input class="input" name="email" value="${p.email}" /></div>
        <div class="row"><div class="field" style="flex:1"><label>Phone</label><input class="input" name="phone" value="${p.phone || ''}" /></div>
        <div class="field" style="flex:1"><label>DOB</label><input class="input" type="date" name="dateOfBirth" value="${p.dateOfBirth || ''}" /></div></div>
        <div class="row">
          <div class="field" style="flex:1"><label>Country</label><select class="input" name="country">${cfg.countries.map((c) => `<option ${c === p.country ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div class="field" style="flex:1"><label>Currency</label><select class="input" name="currency">${cfg.currencies.map((c) => `<option value="${c.code}" ${c.code === p.currency ? 'selected' : ''}>${c.code}</option>`).join('')}</select></div>
        </div>
        <div class="row">
          <div class="field" style="flex:1"><label>Account type</label><select class="input" name="accountType">${cfg.accountTypes.map((c) => `<option ${c === p.accountType ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div class="field" style="flex:1"><label>Status</label><select class="input" name="status">${['pending', 'active', 'suspended'].map((s) => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        </div>
        <div class="row">
          <div class="field" style="flex:1"><label>Role</label><select class="input" name="role">${['user', 'admin'].map((s) => `<option ${s === p.role ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="field" style="flex:1"><label>KYC status</label><select class="input" name="kycStatus">${['unverified', 'pending', 'verified', 'rejected'].map((s) => `<option ${s === p.kycStatus ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Address line 1</label><input class="input" name="addressLine1" value="${p.addressLine1 || ''}" /></div>
        <div class="row"><div class="field" style="flex:1"><label>City</label><input class="input" name="city" value="${p.city || ''}" /></div>
        <div class="field" style="flex:1"><label>State</label><input class="input" name="stateProvince" value="${p.stateProvince || ''}" /></div>
        <div class="field" style="flex:1"><label>Postal</label><input class="input" name="postalCode" value="${p.postalCode || ''}" /></div></div>
        <label class="row" style="align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="twoFactorEnabled" ${p.twoFactorEnabled ? 'checked' : ''} /> Two-factor enabled</label>
        <button class="btn primary block mt-2" type="submit">Save all changes</button>
      </form>
    </div>
    <div id="ut-balance" class="hidden">
      <h4 style="font-size:13px">Add or remove funds</h4>
      <form id="u-bal" class="row mt-1" style="align-items:center">
        <select class="input" name="direction" style="max-width:120px"><option value="credit">Add (+)</option><option value="debit">Remove (−)</option></select>
        <input class="input mono" name="amount" type="number" min="0.01" step="any" placeholder="Amount" required />
        <input class="input" name="note" placeholder="Note (optional)" />
        <button class="btn primary sm nowrap" type="submit">Apply</button>
      </form>
      <p class="muted mt-2" style="font-size:12px">Only the MT5 Smart Market desk can move a user's balance. Writes a ledger entry, notifies the user and sends an email alert.</p>
    </div>
    <div id="ut-trading" class="hidden">
      <h4 style="font-size:13px">Trading account</h4>
      <div class="grid cols-2 mt-1" style="gap:8px">
        <div class="kv"><span class="k">Balance</span><span class="mono">${C(ta.balance ?? p.balance)}</span></div>
        <div class="kv"><span class="k">Open positions</span><span class="mono">${ta.openPositions ?? 0}</span></div>
        <div class="kv"><span class="k">Floating P&L</span><span class="mono ${(ta.floatingPnl ?? 0) >= 0 ? 'up' : 'down'}">${C(ta.floatingPnl ?? 0)}</span></div>
        <div class="kv"><span class="k">Realised P&L</span><span class="mono ${(ta.realisedPnl ?? 0) >= 0 ? 'up' : 'down'}">${C(ta.realisedPnl ?? 0)}</span></div>
        <div class="kv"><span class="k">Total trades</span><span class="mono">${ta.tradesTotal ?? 0}</span></div>
      </div>

      <h4 class="mt-3" style="font-size:13px">AI trading bot</h4>
      ${robot ? `
        <div class="card tight mt-1">
          <div class="between"><b>${robot.name}</b><span class="tag active">running</span></div>
          <div class="grid cols-2 mt-1" style="gap:6px">
            <div class="kv"><span class="k">Stake</span><span class="mono">${C(robot.stake)}</span></div>
            <div class="kv"><span class="k">Duration</span><span>${robot.durationDays} day(s)</span></div>
            <div class="kv"><span class="k">Profit target</span><span class="mono">${C(robot.targetProfit)} (${robot.profitTargetPercent}%)</span></div>
            <div class="kv"><span class="k">Profit so far</span><span class="mono ${robot.stats.netPnl >= 0 ? 'up' : 'down'}">${C(robot.stats.netPnl)} (${robot.currentProfitPercent}%)</span></div>
            <div class="kv"><span class="k">Trades</span><span>${robot.stats.trades} (${robot.stats.wins}W / ${robot.stats.losses}L)</span></div>
            <div class="kv"><span class="k">Time elapsed</span><span>${robot.timeProgressPercent}% · ends ${fmtDay(robot.endsAt)}</span></div>
            <div class="kv"><span class="k">Projected payout</span><span class="mono">${C(robot.projectedValue)}</span></div>
          </div>
          <div class="row mt-2">
            <button class="btn sm" id="robot-run">Run a trade now</button>
            <button class="btn sm" data-robot-detail="${robot.id}">View trades &amp; profit</button>
            <button class="btn sm danger" id="robot-stop">Stop &amp; settle</button>
          </div>
        </div>` : `
        <form id="robot-form" class="mt-1">
          <div class="row">
            <div class="field" style="flex:1"><label>Trading duration</label><select class="input" name="durationDays">${(cfg.aiBot?.durationDays || [1, 3, 7, 14, 30]).map((n) => `<option value="${n}">${n} day(s)</option>`).join('')}</select></div>
            <div class="field" style="flex:1"><label>Profit target</label><select class="input" name="profitTargetPercent">${(cfg.aiBot?.profitTargets || [10, 20, 35, 50, 100]).map((n) => `<option value="${n}">${n}%</option>`).join('')}</select></div>
            <div class="field" style="flex:1"><label>Stake</label><input class="input mono" name="stake" type="number" step="any" placeholder="${cfg.aiBot?.minStake || 100} – ${cfg.aiBot?.maxStake || 100000}" /></div>
          </div>
          <button class="btn primary block" type="submit">Start AI bot for this user</button>
          <p class="faint mt-1" style="font-size:11.5px">The stake is locked from the user's balance. Stake + profit is returned when the bot hits its target or the duration ends. The user is notified and emailed.</p>
        </form>`}

      <h4 class="mt-3" style="font-size:13px">Open a trade for this user</h4>
      <form id="u-trade" class="mt-1">
        <div class="row">
          <div class="field" style="flex:1"><label>Symbol</label><select class="input" name="symbol">${(state.quotes || []).map((q) => `<option>${q.symbol}</option>`).join('') || ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD'].map((x) => `<option>${x}</option>`).join('')}</select></div>
          <div class="field" style="width:110px"><label>Side</label><select class="input" name="side"><option>buy</option><option>sell</option></select></div>
          <div class="field" style="width:90px"><label>Lots</label><input class="input mono" name="lots" type="number" step="0.01" value="0.5" /></div>
          <div class="field" style="width:90px"><label>Lev</label><select class="input" name="leverage"><option>10</option><option selected>20</option><option>50</option><option>100</option></select></div>
        </div>
        <button class="btn primary block" type="submit">Open position on user's account</button>
      </form>

      <h4 class="mt-3" style="font-size:13px">Open positions</h4>
      <div class="table-wrap"><table><thead><tr><th>Symbol</th><th>Side</th><th>Lots</th><th>Entry</th><th>Live P&L</th><th></th></tr></thead>
      <tbody>${d.trades.filter((t) => t.status === 'open').map((t) => `<tr>
        <td class="mono">${t.symbol}</td><td>${t.side}</td><td class="mono">${fmtNum(t.lots, 2)}</td><td class="mono">${fmtNum(t.entryPrice, 5)}</td>
        <td class="mono ${t.livePnl >= 0 ? 'up' : 'down'}">${C(t.livePnl)}</td>
        <td><button class="btn sm ghost" data-tadj="${t.id}">P&L</button> <button class="btn sm danger" data-tclose="${t.id}">Close</button></td>
      </tr>`).join('') || '<tr><td colspan="6" class="empty">No open positions</td></tr>'}</tbody></table></div>
    </div>
    <div id="ut-tx" class="hidden"><div class="table-wrap" style="max-height:280px;overflow:auto"><table><thead><tr><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>${d.transactions.slice(0, 40).map((t) => `<tr class="clickable" data-tx="${t.id}"><td>${t.type.replace('_', ' ')}</td><td class="mono">${C(t.amount)}</td><td><span class="tag ${t.status}">${t.status}</span></td><td class="faint">${fmtDate(t.createdAt)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">None</td></tr>'}</tbody></table></div></div>
    <div id="ut-inv" class="hidden"><div class="table-wrap"><table><thead><tr><th>Plan</th><th>Amount</th><th>Earned</th><th>Status</th></tr></thead>
      <tbody>${d.investments.map((i) => `<tr><td>${i.planName}</td><td class="mono">${C(i.amount)}</td><td class="mono up">+${C(i.accruedTotal)}</td><td><span class="tag ${i.status}">${i.status}</span>${i.status === 'active' ? ` <button class="btn sm danger" data-cancinv="${i.id}">Cancel</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">None</td></tr>'}</tbody></table></div></div>
    <div id="ut-wl" class="hidden">
      <h4 style="font-size:13px">Linked wallets</h4>
      ${d.wallets.length ? d.wallets.map((w) => `<div class="between" style="padding:8px 0;border-bottom:1px solid var(--border)"><span class="mono" style="font-size:12px;word-break:break-all">${w.network} · ${w.address}</span><button class="btn sm ${w.verified ? 'ghost' : 'primary'}" data-wv="${w.id}" data-on="${w.verified ? '0' : '1'}">${w.verified ? 'Unverify' : 'Verify'}</button></div>`).join('') : '<div class="faint">No wallets</div>'}
      <h4 class="mt-3" style="font-size:13px">KYC submissions <span class="faint" style="font-weight:400">(kept permanently)</span></h4>
      ${d.kyc.length ? d.kyc.map((k) => `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div class="between"><span><span class="tag ${k.status}">${k.status}</span> ${k.documentType}${k.documentNumber ? ` · ${k.documentNumber}` : ''}</span><span class="faint" style="font-size:11px">${fmtDay(k.createdAt)}</span></div>
        <div class="mt-1">${(k.documents || []).map((f) => `<a class="file-chip" href="${f.url}" target="_blank">📎 ${f.originalName}</a>`).join('') || '<span class="faint">No files</span>'}</div>
        ${k.reviewNote ? `<div class="faint" style="font-size:11px">Note: ${k.reviewNote}</div>` : ''}
      </div>`).join('') : '<div class="faint">No submissions</div>'}
    </div>`;
  const m = modal(box);
  box.querySelectorAll('#u-tabs button').forEach((b) => b.addEventListener('click', () => {
    box.querySelectorAll('#u-tabs button').forEach((x) => x.classList.toggle('active', x === b));
    ['edit', 'balance', 'trading', 'tx', 'inv', 'wl'].forEach((t) => box.querySelector(`#ut-${t}`).classList.toggle('hidden', t !== b.dataset.t));
  }));
  box.querySelector('#u-edit').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    f.twoFactorEnabled = e.target.twoFactorEnabled.checked;
    try { await api(`/admin/users/${id}`, { method: 'PATCH', body: f }); toast('User updated'); m.close(); pollBadges(); renderers.users(); } catch { /* */ }
  });
  const reload = () => { m.close(); openUser(id); renderers.users(); pollBadges(); };
  box.querySelector('#u-approve')?.addEventListener('click', async () => {
    try { await api(`/admin/users/${id}/approve`, { method: 'POST' }); toast('Approved'); reload(); } catch { /* */ }
  });
  box.querySelector('#u-freeze')?.addEventListener('click', async () => {
    const reason = await promptDialog('The user will be signed out, cannot trade or withdraw, and any running robot is stopped.', { title: 'Freeze account', placeholder: 'Reason (optional)' });
    if (reason === null) return;
    try { await api(`/admin/users/${id}/freeze`, { method: 'POST', body: { reason: reason || undefined } }); toast('Account frozen'); reload(); } catch { /* */ }
  });
  box.querySelector('#u-unfreeze')?.addEventListener('click', async () => {
    try { await api(`/admin/users/${id}/unfreeze`, { method: 'POST' }); toast('Account unfrozen'); reload(); } catch { /* */ }
  });
  box.querySelector('#u-delete')?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Permanently delete ${p.email}? This removes their balance, transactions, trades, robot, wallets and documents. This cannot be undone.`, { title: 'Delete account', confirmText: 'Delete permanently', danger: true }))) return;
    try { await api(`/admin/users/${id}`, { method: 'DELETE' }); toast('Account deleted'); m.close(); renderers.users(); pollBadges(); } catch { /* */ }
  });
  box.querySelector('#u-bal').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api(`/admin/users/${id}/balance`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Balance updated'); reload(); } catch { /* */ }
  });
  box.querySelector('#robot-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      await api(`/admin/users/${id}/robot`, { method: 'POST', body: {
        durationDays: Number(f.durationDays), profitTargetPercent: Number(f.profitTargetPercent), stake: Number(f.stake),
      } });
      toast('AI bot started for user'); reload(); renderers.robots?.();
    } catch { /* */ }
  });
  box.querySelector('#robot-stop')?.addEventListener('click', async () => {
    if (!(await confirmDialog('Stop this user\'s AI bot now? The stake plus current profit is credited back to their balance.', { title: 'Stop AI bot', confirmText: 'Stop & settle', danger: true }))) return;
    try { await api(`/admin/robots/${robot.id}/stop`, { method: 'POST' }); toast('Bot stopped & settled'); reload(); } catch { /* */ }
  });
  box.querySelector('#robot-run')?.addEventListener('click', async () => {
    try { const r = await api(`/admin/robots/${robot.id}/run`, { method: 'POST' }); toast(`Bot traded ${r.symbol || ''} ${r.pnl != null ? C(r.pnl) : ''}`); reload(); } catch { /* */ }
  });
  box.querySelector('[data-robot-detail]')?.addEventListener('click', (e) => openRobot(e.target.dataset.robotDetail));
  box.querySelector('#u-trade').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await api(`/admin/users/${id}/trade`, { method: 'POST', body: { ...f, lots: Number(f.lots), leverage: Number(f.leverage) } }); toast('Position opened for user'); reload(); } catch { /* */ }
  });
  box.querySelectorAll('[data-tclose]').forEach((b) => b.addEventListener('click', async () => {
    const px = await promptDialog('Leave blank to close at the live price, or enter a specific exit price.', { title: 'Close position', placeholder: 'Exit price (optional)' });
    if (px === null) return;
    try { await api(`/admin/trades/${b.dataset.tclose}/close`, { method: 'POST', body: px ? { exitPrice: Number(px) } : {} }); toast('Position closed'); reload(); } catch { /* */ }
  }));
  box.querySelectorAll('[data-tadj]').forEach((b) => b.addEventListener('click', async () => {
    const pnl = await promptDialog('Set this open position\'s running P&L (the entry price is adjusted to match).', { title: 'Adjust position P&L', placeholder: 'e.g. 150 or -40' });
    if (pnl === null || pnl === '') return;
    try { await api(`/admin/trades/${b.dataset.tadj}`, { method: 'PATCH', body: { pnl: Number(pnl) } }); toast('Position adjusted'); reload(); } catch { /* */ }
  }));
  box.querySelectorAll('[data-tx]').forEach((r) => r.addEventListener('click', () => { m.close(); openTx(r.dataset.tx, true); }));
  box.querySelectorAll('[data-cancinv]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('The remaining principal will be refunded to the user. ROI already paid stays paid.', { title: 'Cancel investment', confirmText: 'Cancel investment', danger: true }))) return;
    try { await api(`/admin/investments/${b.dataset.cancinv}/cancel`, { method: 'POST' }); toast('Cancelled'); reload(); } catch { /* */ }
  }));
  box.querySelectorAll('[data-wv]').forEach((b) => b.addEventListener('click', async () => {
    try { await api(`/admin/wallets/${b.dataset.wv}/verify`, { method: 'POST', body: { verified: b.dataset.on === '1' } }); toast('Wallet updated'); reload(); } catch { /* */ }
  }));
}

/* ---------------- TRANSACTIONS (all) ---------------- */
renderers.transactions = async () => {
  const v = $('#view-transactions');
  v.innerHTML = `${head('Transactions', 'Every ledger entry. Click a row to view or edit.')}
    <div class="card">
      <div class="tabs" id="t-filter">${['all', 'deposit', 'withdrawal', 'investment', 'roi', 'referral', 'trade_pnl', 'admin_credit', 'admin_debit'].map((t, i) => `<button data-t="${t}" class="${i === 0 ? 'active' : ''}">${t === 'all' ? 'All' : t.replace('_', ' ')}</button>`).join('')}</div>
      <div class="table-wrap"><table><thead><tr><th>User</th><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody id="t-body"><tr><td colspan="5" class="empty">Loading…</td></tr></tbody></table></div>
    </div>`;
  const load = async (type) => {
    const q = new URLSearchParams({ limit: '300' });
    if (type && type !== 'all') q.set('type', type);
    try {
      const { data } = await api(`/admin/transactions?${q}`, { silent: true });
      const body = $('#t-body');
      body.innerHTML = data.length ? data.map((t) => `<tr class="clickable" data-tx="${t.id}">
        <td>${t.user?.name || '—'}<div class="faint" style="font-size:11px">${t.user?.email || ''}</div></td>
        <td>${t.type.replace('_', ' ')}</td><td class="mono">${C(t.amount)}</td><td><span class="tag ${t.status}">${t.status}</span></td>
        <td class="faint nowrap">${fmtDate(t.createdAt)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">Nothing</td></tr>';
      body.querySelectorAll('[data-tx]').forEach((r) => r.addEventListener('click', () => openTx(r.dataset.tx, true)));
    } catch { /* */ }
  };
  v.querySelectorAll('#t-filter button').forEach((b) => b.addEventListener('click', () => {
    v.querySelectorAll('#t-filter button').forEach((x) => x.classList.toggle('active', x === b));
    load(b.dataset.t);
  }));
  load('all');
};

/* ---------------- INVESTMENTS ---------------- */
renderers.investments = async () => {
  const v = $('#view-investments');
  v.innerHTML = head('Investments') + '<div class="empty">Loading…</div>';
  let res; try { res = await api('/admin/investments?limit=200', { silent: true }); } catch { return; }
  v.innerHTML = head('Investments', 'Every stake across the platform.') + `
    <div class="card"><div class="table-wrap"><table><thead><tr><th>User</th><th>Plan</th><th>Amount</th><th>ROI earned</th><th>Progress</th><th>Status</th><th>Ends</th><th></th></tr></thead>
    <tbody>${res.data.map((i) => `<tr>
      <td>${i.user?.name || '—'}<div class="faint" style="font-size:11px">${i.user?.email || ''}</div></td>
      <td>${i.planName}</td><td class="mono">${C(i.amount)}</td><td class="mono up">+${C(i.accruedTotal)}</td>
      <td><div class="progress" style="width:80px"><span style="width:${i.progressPercent}%"></span></div></td>
      <td><span class="tag ${i.status}">${i.status}</span></td><td class="faint nowrap">${fmtDay(i.endsAt)}</td>
      <td>${i.status === 'active' ? `<button class="btn sm danger" data-cancel="${i.id}">Cancel</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">No investments</td></tr>'}</tbody></table></div></div>`;
  v.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('The remaining principal will be refunded to the user.', { title: 'Cancel investment', confirmText: 'Cancel investment', danger: true }))) return;
    try { await api(`/admin/investments/${b.dataset.cancel}/cancel`, { method: 'POST' }); toast('Cancelled'); renderers.investments(); } catch { /* */ }
  }));
};

/* ---------------- TRADES ---------------- */
renderers.trades = async () => {
  const v = $('#view-trades');
  v.innerHTML = head('Trades') + '<div class="empty">Loading…</div>';
  let res; try { res = await api('/admin/trades?limit=200', { silent: true }); } catch { return; }
  v.innerHTML = head('Trades', 'Positions opened on the desk.') + `
    <div class="card"><div class="table-wrap"><table><thead><tr><th>User</th><th>Symbol</th><th>Side</th><th>Lots</th><th>Entry</th><th>Live/Exit</th><th>P&L</th><th>Status</th><th></th></tr></thead>
    <tbody>${res.data.map((t) => `<tr>
      <td>${t.user?.name || '—'}</td><td class="mono">${t.symbol}</td><td>${t.side}</td><td class="mono">${fmtNum(t.lots, 2)}</td>
      <td class="mono">${fmtNum(t.entryPrice, 5)}</td><td class="mono">${fmtNum(t.status === 'open' ? t.livePrice : t.exitPrice, 5)}</td>
      <td class="mono ${(t.status === 'open' ? t.livePnl : t.pnl) >= 0 ? 'up' : 'down'}">${C(t.status === 'open' ? t.livePnl : t.pnl)}</td>
      <td><span class="tag ${t.status}">${t.status}</span></td>
      <td>${t.status === 'open' ? `<button class="btn sm danger" data-close="${t.id}">Force close</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">No trades</td></tr>'}</tbody></table></div></div>`;
  v.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', async () => {
    try { await api(`/admin/trades/${b.dataset.close}/close`, { method: 'POST' }); toast('Closed'); renderers.trades(); } catch { /* */ }
  }));
};

/* ---------------- AI TRADING BOTS ---------------- */
renderers.robots = async () => {
  const v = $('#view-robots');
  v.innerHTML = head('AI Trading Bots', 'Every AI bot session across the platform. Monitor profit and inspect each bot\'s trades. Started from a user\'s Trading tab.') + '<div class="empty">Loading…</div>';
  let rows; try { rows = await api('/admin/robots', { silent: true }); } catch { return; }
  const active = rows.filter((r) => r.status === 'active');
  const stopped = rows.filter((r) => r.status !== 'active');
  const stakeLocked = active.reduce((a, r) => a + (r.stake || 0), 0);
  const rowHtml = (r) => `<tr data-open="${r.id}" style="cursor:pointer">
    <td>${r.user?.name || '—'}<div class="faint" style="font-size:11px">${r.user?.email || ''}</div></td>
    <td>${r.durationDays}d · ${r.profitTargetPercent}%</td>
    <td class="mono">${C(r.stake)}</td>
    <td class="mono">${C(r.targetProfit)}</td>
    <td class="mono ${r.stats.netPnl >= 0 ? 'up' : 'down'}">${C(r.stats.netPnl)} <span class="faint">(${r.currentProfitPercent}%)</span></td>
    <td>${r.stats.trades} <span class="faint">(${r.stats.wins}W/${r.stats.losses}L)</span></td>
    <td>${r.status === 'active' ? `${r.timeProgressPercent}% · ends ${fmtDay(r.endsAt)}` : `<span class="faint">${r.completionReason || ''} ${r.completedAt ? fmtDay(r.completedAt) : ''}</span>`}</td>
    <td><span class="tag ${r.status === 'active' ? 'active' : 'closed'}">${r.status}</span></td>
    <td>${r.status === 'active' ? `<button class="btn sm ghost" data-run="${r.id}">Run</button> <button class="btn sm danger" data-stop="${r.id}">Stop</button>` : ''}</td></tr>`;
  const cols = '<tr><th>User</th><th>Plan</th><th>Stake</th><th>Target</th><th>Profit</th><th>Trades</th><th>Progress</th><th>Status</th><th></th></tr>';
  const netAll = rows.reduce((a, r) => a + r.stats.netPnl, 0);
  v.innerHTML = head('AI Trading Bots', 'Every AI bot session across the platform. Click a row for trade-by-trade detail.') + `
    <div class="grid cols-4"><div class="card stat tight"><div class="label">Active bots</div><div class="value">${active.length}</div></div>
      <div class="card stat tight"><div class="label">Stake locked</div><div class="value">${C(stakeLocked)}</div></div>
      <div class="card stat tight"><div class="label">Total trades</div><div class="value">${rows.reduce((a, r) => a + r.stats.trades, 0)}</div></div>
      <div class="card stat tight"><div class="label">Bot profit paid (all)</div><div class="value ${netAll >= 0 ? 'up' : 'down'}">${C(netAll)}</div></div></div>
    <div class="card mt-3"><h3>Active</h3><div class="table-wrap mt-2"><table><thead>${cols}</thead>
    <tbody>${active.map(rowHtml).join('') || '<tr><td colspan="9" class="empty">No active bots</td></tr>'}</tbody></table></div></div>
    ${stopped.length ? `<div class="card mt-3"><h3>Completed</h3><div class="table-wrap mt-2"><table><thead>${cols}</thead><tbody>${stopped.map(rowHtml).join('')}</tbody></table></div></div>` : ''}`;
  v.querySelectorAll('[data-stop]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!(await confirmDialog('Stop this AI bot? The stake plus current profit is credited to the user\'s balance.', { title: 'Stop AI bot', confirmText: 'Stop & settle', danger: true }))) return;
    try { await api(`/admin/robots/${b.dataset.stop}/stop`, { method: 'POST' }); toast('Bot stopped & settled'); renderers.robots(); } catch { /* */ }
  }));
  v.querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    try { const r = await api(`/admin/robots/${b.dataset.run}/run`, { method: 'POST' }); toast(`Traded ${r.symbol || ''} ${r.pnl != null ? C(r.pnl) : ''}`); renderers.robots(); } catch { /* */ }
  }));
  v.querySelectorAll('[data-open]').forEach((tr) => tr.addEventListener('click', () => openRobot(tr.dataset.open)));
};

async function openRobot(id) {
  let d; try { d = await api(`/admin/robots/${id}`, { silent: true }); } catch { return; }
  const r = d.robot;
  const box = el('div');
  const rows = [
    ['User', `${r.user?.name || '—'} (${r.user?.email || ''})`],
    ['Status', `<span class="tag ${r.status === 'active' ? 'active' : 'closed'}">${r.status}</span>${r.completionReason ? ` · ${r.completionReason}` : ''}`],
    ['Stake', C(r.stake)], ['Duration', `${r.durationDays} day(s)`],
    ['Profit target', `${C(r.targetProfit)} (${r.profitTargetPercent}%)`],
    ['Profit so far', `${C(r.stats.netPnl)} (${r.currentProfitPercent}%)`],
    ['Projected payout', C(r.projectedValue)],
    ['Trades', `${r.stats.trades} — ${r.stats.wins} winning / ${r.stats.losses} losing`],
    ['Time elapsed', `${r.timeProgressPercent}%`],
    ['Started', fmtDate(r.startedAt || r.createdAt)],
    [r.status === 'active' ? 'Ends' : 'Finished', r.status === 'active' ? fmtDate(r.endsAt) : (r.completedAt ? fmtDate(r.completedAt) : '—')],
  ];
  box.innerHTML = `<div class="between"><h3>${r.name}</h3><span class="tag ${r.status === 'active' ? 'active' : 'closed'}">${r.status}</span></div>
    <div class="mt-2">${rows.map(([k, x]) => `<div class="detail-row"><span class="dk">${k}</span><span class="dv mono">${x}</span></div>`).join('')}</div>
    ${r.status === 'active' ? `<div class="row mt-2"><button class="btn sm" id="rd-run">Run a trade now</button><button class="btn sm danger" id="rd-stop">Stop &amp; settle</button></div>` : ''}
    <h4 class="mt-3" style="font-size:13px">Trades placed by this bot (${d.trades.length})</h4>
    <div class="table-wrap mt-1"><table><thead><tr><th>Symbol</th><th>Side</th><th>Lots</th><th>Entry</th><th>Exit</th><th>P&L</th><th>Closed</th></tr></thead>
    <tbody>${d.trades.length ? d.trades.map((t) => `<tr>
      <td class="mono">${t.symbol}</td><td>${t.side}</td><td class="mono">${(t.lots ?? 0).toFixed(2)}</td>
      <td class="mono">${(t.entryPrice ?? 0).toFixed(5)}</td><td class="mono">${(t.exitPrice ?? 0).toFixed(5)}</td>
      <td class="mono ${t.pnl >= 0 ? 'up' : 'down'}">${t.pnl >= 0 ? '+' : ''}${C(t.pnl)}</td>
      <td class="faint nowrap">${fmtDate(t.closedAt)}</td></tr>`).join('') : '<tr><td colspan="7" class="empty">No trades yet</td></tr>'}</tbody></table></div>`;
  const m = modal(box);
  box.querySelector('#rd-run')?.addEventListener('click', async () => {
    try { const x = await api(`/admin/robots/${id}/run`, { method: 'POST' }); toast(`Traded ${x.symbol || ''} ${x.pnl != null ? C(x.pnl) : ''}`); m.close(); openRobot(id); renderers.robots?.(); } catch { /* */ }
  });
  box.querySelector('#rd-stop')?.addEventListener('click', async () => {
    if (!(await confirmDialog('Stop this AI bot? Stake + current profit is credited to the user\'s balance.', { title: 'Stop AI bot', confirmText: 'Stop & settle', danger: true }))) return;
    try { await api(`/admin/robots/${id}/stop`, { method: 'POST' }); toast('Bot stopped & settled'); m.close(); renderers.robots?.(); } catch { /* */ }
  });
}

/* ---------------- EMAIL LOG ---------------- */
renderers.emails = async () => {
  const v = $('#view-emails');
  v.innerHTML = head('Email alert log', 'Every alert the platform has sent. If SMTP is configured in .env these are delivered for real; otherwise they are logged here.') + '<div class="empty">Loading…</div>';
  let rows; try { rows = await api('/admin/emails', { silent: true }); } catch { return; }
  v.innerHTML = head('Email alert log', 'Every alert the platform has sent.') + `
    <div class="card"><div class="table-wrap"><table><thead><tr><th>To</th><th>Subject</th><th>Category</th><th>Delivery</th><th>When</th></tr></thead>
    <tbody>${rows.map((e) => `<tr class="clickable" data-eml='${encodeURIComponent(JSON.stringify({ s: e.subject, b: e.body, t: e.to }))}'>
      <td class="mono" style="font-size:12px">${e.to || '—'}</td><td>${e.subject}</td><td>${e.category}</td>
      <td><span class="tag ${e.delivery === 'sent' ? 'completed' : e.delivery === 'failed' ? 'rejected' : 'pending'}">${e.delivery}</span></td>
      <td class="faint nowrap">${fmtDate(e.createdAt)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No emails yet</td></tr>'}</tbody></table></div></div>`;
  v.querySelectorAll('[data-eml]').forEach((r) => r.addEventListener('click', () => {
    const e = JSON.parse(decodeURIComponent(r.dataset.eml));
    const box = el('div');
    box.innerHTML = `<h3>${e.s}</h3><div class="faint mt-1" style="font-size:12px">To: ${e.t || '—'}</div><p class="mt-2" style="font-size:13.5px;white-space:pre-wrap">${e.b}</p>`;
    modal(box);
  }));
};

/* ---------------- WALLETS ---------------- */
renderers.wallets = async () => {
  const v = $('#view-wallets');
  v.innerHTML = head('Linked wallets') + '<div class="empty">Loading…</div>';
  let rows; try { rows = await api('/admin/wallets', { silent: true }); } catch { return; }
  v.innerHTML = head('Linked wallets', 'User-saved withdrawal addresses.') + `
    <div class="card"><div class="table-wrap"><table><thead><tr><th>User</th><th>Label</th><th>Network</th><th>Address</th><th>Verified</th><th></th></tr></thead>
    <tbody>${rows.map((w) => `<tr><td>${w.user?.name || '—'}</td><td>${w.label}</td><td>${w.network}</td><td class="mono" style="word-break:break-all">${w.address}</td>
      <td>${w.verified ? '<span class="tag verified">yes</span>' : '<span class="tag pending">no</span>'}</td>
      <td><button class="btn sm ${w.verified ? 'ghost' : 'primary'}" data-w="${w.id}" data-on="${w.verified ? '0' : '1'}">${w.verified ? 'Unverify' : 'Verify'}</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No linked wallets</td></tr>'}</tbody></table></div></div>`;
  v.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', async () => {
    try { await api(`/admin/wallets/${b.dataset.w}/verify`, { method: 'POST', body: { verified: b.dataset.on === '1' } }); toast('Updated'); renderers.wallets(); } catch { /* */ }
  }));
};

/* ---------------- PLANS ---------------- */
renderers.plans = async () => {
  const v = $('#view-plans');
  v.innerHTML = head('Investment plans') + '<div class="between"><div></div><button class="btn primary sm" id="new-plan">+ New plan</button></div><div class="grid cols-2 mt-2" id="plan-list"><div class="empty">Loading…</div></div>';
  let plans; try { plans = await api('/admin/plans', { silent: true }); } catch { return; }
  $('#plan-list').innerHTML = plans.map((p) => `
    <div class="card">
      <div class="between"><h3>${p.name} ${p.isActive ? '' : '<span class="tag rejected">inactive</span>'}</h3><span class="pill up">${fmtNum(p.roiPercent, 2)}%</span></div>
      <p class="muted mt-1" style="font-size:13px">${p.description}</p>
      <div class="grid cols-2 mt-1" style="gap:6px">
        <div class="kv"><span class="k">Range</span><span>${C(p.minAmount)}–${C(p.maxAmount)}</span></div>
        <div class="kv"><span class="k">Cycle</span><span>${p.periodHours}h × ${p.durationDays}d</span></div>
        <div class="kv"><span class="k">Principal</span><span>${p.principalReturn ? 'returned' : 'reinvested'}</span></div>
      </div>
      <div class="row mt-2"><button class="btn sm ghost" data-edit="${p.id}">Edit</button><button class="btn sm danger" data-del="${p.id}">Delete</button></div>
    </div>`).join('') || '<div class="empty">No plans</div>';
  $('#new-plan').onclick = () => planForm();
  v.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => planForm(plans.find((p) => p.id === b.dataset.edit))));
  v.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('Delete this investment plan? If it has active investments it is deactivated instead of removed.', { title: 'Delete plan', confirmText: 'Delete', danger: true }))) return;
    try { await api(`/admin/plans/${b.dataset.del}`, { method: 'DELETE' }); toast('Removed'); renderers.plans(); } catch { /* */ }
  }));
};
function planForm(plan) {
  const p = plan || {};
  const box = el('div');
  box.innerHTML = `
    <h3>${plan ? 'Edit' : 'New'} plan</h3>
    <form id="pf" class="mt-2">
      <div class="field"><label>Name</label><input class="input" name="name" value="${p.name || ''}" required /></div>
      <div class="field"><label>Description</label><textarea class="input" name="description" rows="2">${p.description || ''}</textarea></div>
      <div class="row"><div class="field" style="flex:1"><label>Min</label><input class="input mono" name="minAmount" type="number" step="any" value="${p.minAmount ?? 100}" /></div>
      <div class="field" style="flex:1"><label>Max</label><input class="input mono" name="maxAmount" type="number" step="any" value="${p.maxAmount ?? 5000}" /></div></div>
      <div class="row"><div class="field" style="flex:1"><label>ROI %/cycle</label><input class="input mono" name="roiPercent" type="number" step="any" value="${p.roiPercent ?? 3}" /></div>
      <div class="field" style="flex:1"><label>Cycle hrs</label><input class="input mono" name="periodHours" type="number" step="any" value="${p.periodHours ?? 24}" /></div>
      <div class="field" style="flex:1"><label>Days</label><input class="input mono" name="durationDays" type="number" step="any" value="${p.durationDays ?? 7}" /></div></div>
      <label class="row" style="align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="principalReturn" ${p.principalReturn !== false ? 'checked' : ''} /> Return principal at term end</label>
      <label class="row mt-1" style="align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="isActive" ${p.isActive !== false ? 'checked' : ''} /> Active</label>
      <button class="btn primary block mt-2" type="submit">${plan ? 'Save' : 'Create'}</button>
    </form>`;
  const m = modal(box);
  box.querySelector('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      name: f.name.value, description: f.description.value,
      minAmount: +f.minAmount.value, maxAmount: +f.maxAmount.value, roiPercent: +f.roiPercent.value,
      periodHours: +f.periodHours.value, durationDays: +f.durationDays.value,
      principalReturn: f.principalReturn.checked, isActive: f.isActive.checked,
    };
    try {
      if (plan) await api(`/admin/plans/${plan.id}`, { method: 'PATCH', body });
      else await api('/admin/plans', { method: 'POST', body });
      toast('Plan saved'); m.close(); renderers.plans();
    } catch { /* */ }
  });
}

/* ---------------- CRYPTO METHODS ---------------- */
renderers.crypto = async () => {
  const v = $('#view-crypto');
  v.innerHTML = head('Crypto deposit methods', 'Set the deposit address for each coin/network. Users can only deposit to methods that have an address.') + '<div class="between"><div></div><button class="btn primary sm" id="new-cm">+ Add method</button></div><div class="grid cols-2 mt-2" id="cm-list"><div class="empty">Loading…</div></div>';
  let s; try { s = await api('/admin/settings', { silent: true }); } catch { return; }
  const methods = [...s.cryptoMethods].sort((a, b) => a.rank - b.rank);
  $('#cm-list').innerHTML = methods.map((m) => `
    <div class="card">
      <div class="between"><h3>${m.symbol} · ${m.network} ${m.active ? '' : '<span class="tag rejected">off</span>'}</h3><span class="pill ${m.address ? 'up' : 'warn'}">${m.address ? 'address set' : 'no address'}</span></div>
      <form class="cm-form mt-2" data-id="${m.id}">
        <div class="row"><div class="field" style="flex:1"><label>Symbol</label><input class="input" name="symbol" value="${m.symbol}" /></div>
        <div class="field" style="flex:1"><label>Network</label><input class="input" name="network" value="${m.network}" /></div>
        <div class="field" style="width:80px"><label>Rank</label><input class="input mono" name="rank" type="number" value="${m.rank}" /></div></div>
        <div class="field"><label>Deposit address</label><input class="input mono" name="address" value="${m.address || ''}" placeholder="Paste receiving address" /></div>
        <div class="row"><div class="field" style="flex:1"><label>Memo / tag</label><input class="input" name="memo" value="${m.memo || ''}" /></div>
        <div class="field" style="width:110px"><label>Min deposit</label><input class="input mono" name="minDeposit" type="number" step="any" value="${m.minDeposit}" /></div>
        <div class="field" style="width:110px"><label>Confirms</label><input class="input mono" name="confirmations" type="number" value="${m.confirmations}" /></div></div>
        <div class="field"><label>Instructions</label><input class="input" name="instructions" value="${(m.instructions || '').replace(/"/g, '&quot;')}" /></div>
        <label class="row" style="align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="active" ${m.active ? 'checked' : ''} /> Active</label>
        <div class="row mt-2"><button class="btn primary sm" type="submit">Save</button><button class="btn danger sm" type="button" data-del="${m.id}">Delete</button></div>
      </form>
    </div>`).join('');
  $('#new-cm').onclick = async () => {
    try { await api('/admin/settings/crypto', { method: 'POST', body: { symbol: 'NEW', network: 'Mainnet' } }); toast('Method added'); renderers.crypto(); } catch { /* */ }
  };
  v.querySelectorAll('.cm-form').forEach((f) => {
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(f));
      body.active = f.active.checked;
      try { await api(`/admin/settings/crypto/${f.dataset.id}`, { method: 'PATCH', body }); toast('Saved'); renderers.crypto(); } catch { /* */ }
    });
    f.querySelector('[data-del]').addEventListener('click', async () => {
      if (!(await confirmDialog('Delete this crypto deposit method? Users will no longer be able to deposit with it.', { title: 'Delete method', confirmText: 'Delete', danger: true }))) return;
      try { await api(`/admin/settings/crypto/${f.dataset.id}`, { method: 'DELETE' }); toast('Method deleted'); renderers.crypto(); } catch { /* */ }
    });
  });
};

/* ---------------- SETTINGS ---------------- */
renderers.settings = async () => {
  const v = $('#view-settings');
  let s; try { s = await api('/admin/settings', { silent: true }); } catch { return; }
  v.innerHTML = `${head('Platform settings', 'Global economics and funding configuration.')}
    <div class="grid cols-2">
      <div class="card"><h3>Economics</h3>
        <form id="cfg" class="mt-2">
          <div class="row"><div class="field" style="flex:1"><label>Brand name</label><input class="input" name="brandName" value="${s.brandName}" /></div>
          <div class="field" style="flex:1"><label>Base currency</label><input class="input" name="baseCurrency" value="${s.baseCurrency}" /></div></div>
          <div class="row"><div class="field" style="flex:1"><label>Referral %</label><input class="input mono" name="referralPercent" type="number" step="any" value="${s.referralPercent}" /></div>
          <div class="field" style="flex:1"><label>Withdrawal fee %</label><input class="input mono" name="withdrawalFeePercent" type="number" step="any" value="${s.withdrawalFeePercent}" /></div></div>
          <div class="row"><div class="field" style="flex:1"><label>Min deposit</label><input class="input mono" name="minDeposit" type="number" step="any" value="${s.minDeposit}" /></div>
          <div class="field" style="flex:1"><label>Min withdrawal</label><input class="input mono" name="minWithdrawal" type="number" step="any" value="${s.minWithdrawal}" /></div>
          <div class="field" style="flex:1"><label>Max withdrawal <span class="hint">0 = none</span></label><input class="input mono" name="maxWithdrawal" type="number" step="any" value="${s.maxWithdrawal || 0}" /></div></div>
          <div class="field"><label>Support email</label><input class="input" name="supportEmail" value="${s.supportEmail}" /></div>
          <label class="row" style="align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="requireKycForWithdrawal" ${s.requireKycForWithdrawal ? 'checked' : ''} /> Require verified KYC before withdrawal</label>
          <label class="row mt-1" style="align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="emailAlertsEnabled" ${s.emailAlertsEnabled ? 'checked' : ''} /> Send email alerts (deposits, withdrawals, trades, robots, account changes)</label>
          <button class="btn primary block mt-2" type="submit">Save economics</button>
        </form>
      </div>
      <div class="card"><h3>Bank deposit details</h3>
        <form id="bank" class="mt-2">
          <label class="row" style="align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="enabled" ${s.bankDeposit.enabled ? 'checked' : ''} /> Enable bank transfers</label>
          <div class="field mt-1"><label>Bank name</label><input class="input" name="bankName" value="${s.bankDeposit.bankName || ''}" /></div>
          <div class="field"><label>Account name</label><input class="input" name="accountName" value="${s.bankDeposit.accountName || ''}" /></div>
          <div class="row"><div class="field" style="flex:1"><label>Account number</label><input class="input" name="accountNumber" value="${s.bankDeposit.accountNumber || ''}" /></div>
          <div class="field" style="flex:1"><label>SWIFT/BIC</label><input class="input" name="swift" value="${s.bankDeposit.swift || ''}" /></div></div>
          <div class="field"><label>IBAN</label><input class="input" name="iban" value="${s.bankDeposit.iban || ''}" /></div>
          <div class="field"><label>Reference note</label><input class="input" name="reference" value="${s.bankDeposit.reference || ''}" /></div>
          <div class="field"><label>Instructions</label><input class="input" name="instructions" value="${(s.bankDeposit.instructions || '').replace(/"/g, '&quot;')}" /></div>
          <button class="btn primary block" type="submit">Save bank details</button>
        </form>
      </div>
      <div class="card"><h3>AI trading bot</h3>
        <form id="aibot" class="mt-2">
          <label class="row" style="align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="enabled" ${s.aiBot?.enabled !== false ? 'checked' : ''} /> Bot available to users</label>
          <div class="row mt-1"><div class="field" style="flex:1"><label>Min stake</label><input class="input mono" name="minStake" type="number" step="any" value="${s.aiBot?.minStake ?? 100}" /></div>
          <div class="field" style="flex:1"><label>Max stake</label><input class="input mono" name="maxStake" type="number" step="any" value="${s.aiBot?.maxStake ?? 100000}" /></div></div>
          <div class="field"><label>Win rate <span class="hint">0–1, e.g. 0.72</span></label><input class="input mono" name="winRate" type="number" step="0.01" min="0" max="1" value="${s.aiBot?.winRate ?? 0.72}" /></div>
          <div class="field"><label>Duration options <span class="hint">days, comma-separated</span></label><input class="input mono" name="durationDays" value="${(s.aiBot?.durationDays || [1, 3, 7, 14, 30]).join(', ')}" /></div>
          <div class="field"><label>Profit target options <span class="hint">%, comma-separated</span></label><input class="input mono" name="profitTargets" value="${(s.aiBot?.profitTargets || [10, 20, 35, 50, 100]).join(', ')}" /></div>
          <button class="btn primary block mt-1" type="submit">Save AI bot config</button>
          <p class="faint mt-1" style="font-size:11.5px">Users pick one duration and one profit target from these lists. Changes apply to new bot sessions only.</p>
        </form>
      </div>
    </div>`;
  $('#cfg').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      brandName: f.brandName.value, baseCurrency: f.baseCurrency.value.toUpperCase(),
      referralPercent: +f.referralPercent.value, withdrawalFeePercent: +f.withdrawalFeePercent.value,
      minDeposit: +f.minDeposit.value, minWithdrawal: +f.minWithdrawal.value, maxWithdrawal: +f.maxWithdrawal.value || 0,
      supportEmail: f.supportEmail.value, requireKycForWithdrawal: f.requireKycForWithdrawal.checked,
      emailAlertsEnabled: f.emailAlertsEnabled.checked,
    };
    try { await api('/admin/settings', { method: 'PUT', body }); state.base = body.baseCurrency; toast('Saved'); } catch { /* */ }
  });
  $('#bank').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const bankDeposit = {
      enabled: f.enabled.checked, bankName: f.bankName.value, accountName: f.accountName.value,
      accountNumber: f.accountNumber.value, swift: f.swift.value, iban: f.iban.value,
      reference: f.reference.value, instructions: f.instructions.value,
    };
    try { await api('/admin/settings', { method: 'PUT', body: { bankDeposit } }); toast('Bank details saved'); } catch { /* */ }
  });
  $('#aibot').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const nums = (str) => String(str).split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0);
    const aiBot = {
      enabled: f.enabled.checked,
      minStake: +f.minStake.value || 0,
      maxStake: +f.maxStake.value || 0,
      winRate: Math.min(1, Math.max(0, +f.winRate.value || 0.72)),
      durationDays: nums(f.durationDays.value),
      profitTargets: nums(f.profitTargets.value),
    };
    if (!aiBot.durationDays.length || !aiBot.profitTargets.length) { toast('Add at least one duration and one profit target', 'error'); return; }
    try { await api('/admin/settings', { method: 'PUT', body: { aiBot } }); toast('AI bot config saved'); } catch { /* */ }
  });
};

/* ---------------- TESTIMONIALS ---------------- */
renderers.testimonials = async () => {
  const v = $('#view-testimonials');
  v.innerHTML = head('Testimonials', 'These appear as the site-wide pop-up (3 seconds each) and in the "What our members say" section.') + '<div class="between"><div></div><button class="btn primary sm" id="new-tst">+ Add testimonial</button></div><div class="grid cols-2 mt-2" id="tst-list"><div class="empty">Loading…</div></div>';
  let rows; try { rows = await api('/admin/testimonials', { silent: true }); } catch { return; }
  $('#tst-list').innerHTML = rows.map((t) => `
    <div class="card">
      <div class="between"><h3>${t.name} ${t.active ? '' : '<span class="tag rejected">hidden</span>'}</h3><span style="color:#ffc94d">${'★'.repeat(t.rating || 5)}</span></div>
      <form class="tst-form mt-2" data-id="${t.id}">
        <div class="row"><div class="field" style="flex:1"><label>Name</label><input class="input" name="name" value="${(t.name || '').replace(/"/g, '&quot;')}" /></div>
        <div class="field" style="flex:1"><label>Location</label><input class="input" name="location" value="${(t.location || '').replace(/"/g, '&quot;')}" /></div></div>
        <div class="row"><div class="field" style="flex:1"><label>Plan</label><input class="input" name="plan" value="${(t.plan || '').replace(/"/g, '&quot;')}" /></div>
        <div class="field" style="width:90px"><label>Rating</label><select class="input" name="rating">${[5, 4, 3, 2, 1].map((n) => `<option ${n === t.rating ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field" style="width:80px"><label>Order</label><input class="input mono" name="order" type="number" value="${t.order ?? 0}" /></div></div>
        <div class="field"><label>Text</label><textarea class="input" name="text" rows="3">${t.text || ''}</textarea></div>
        <label class="row" style="align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="active" ${t.active ? 'checked' : ''} /> Visible</label>
        <div class="row mt-2"><button class="btn primary sm" type="submit">Save</button><button class="btn danger sm" type="button" data-del="${t.id}">Delete</button></div>
      </form>
    </div>`).join('') || '<div class="empty">No testimonials</div>';
  $('#new-tst').onclick = async () => {
    try { await api('/admin/testimonials', { method: 'POST', body: { name: 'New member', text: 'Share what a member told you about their experience and payouts here.', rating: 5 } }); toast('Added'); renderers.testimonials(); } catch { /* */ }
  };
  v.querySelectorAll('.tst-form').forEach((f) => {
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(f));
      body.active = f.active.checked;
      try { await api(`/admin/testimonials/${f.dataset.id}`, { method: 'PATCH', body }); toast('Saved'); renderers.testimonials(); } catch { /* */ }
    });
    f.querySelector('[data-del]').addEventListener('click', async () => {
      if (!(await confirmDialog('Delete this testimonial? It will be removed from the site pop-up and the landing page.', { title: 'Delete testimonial', confirmText: 'Delete', danger: true }))) return;
      try { await api(`/admin/testimonials/${f.dataset.id}`, { method: 'DELETE' }); toast('Testimonial deleted'); renderers.testimonials(); } catch { /* */ }
    });
  });
};

/* ---------------- BROADCAST ---------------- */
renderers.broadcast = async () => {
  const v = $('#view-broadcast');
  v.innerHTML = `${head('Announcements', 'Send an in-app notification to every user, or one user.')}
    <div class="card" style="max-width:560px">
      <form id="bc">
        <div class="field"><label>Title</label><input class="input" name="title" required /></div>
        <div class="field"><label>Message</label><textarea class="input" name="body" rows="3"></textarea></div>
        <div class="row"><div class="field" style="flex:1"><label>Level</label><select class="input" name="level"><option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="danger">Danger</option></select></div>
        <div class="field" style="flex:1"><label>Send to user email <span class="hint">blank = everyone</span></label><input class="input" name="email" placeholder="everyone" /></div></div>
        <button class="btn primary block" type="submit">Send announcement</button>
      </form>
    </div>`;
  $('#bc').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    let userId;
    if (f.email) {
      try { const { data } = await api(`/admin/users?search=${encodeURIComponent(f.email)}&limit=1`, { silent: true }); userId = data[0]?.id; if (!userId) return toast('No user with that email', 'warn'); } catch { return; }
    }
    try { await api('/admin/notifications/broadcast', { method: 'POST', body: { title: f.title, body: f.body, level: f.level, userId } }); toast('Announcement sent'); e.target.reset(); } catch { /* */ }
  });
};

/* ---------------- POP-UP MESSAGES ---------------- */
const POP_STYLE = { info: '📣 Info', success: '✅ Success', warning: '⚠️ Warning', danger: '🚨 Urgent' };

renderers.popups = async () => {
  const v = $('#view-popups');
  v.innerHTML = head('Pop-up Messages', 'Send a message that pops up on every member\'s dashboard (or one member\'s). It stays queued until they tap “Got it”, and you can track who has seen it.') + '<div class="empty">Loading…</div>';
  let rows; try { rows = await api('/admin/popups', { silent: true }); } catch { return; }

  v.innerHTML = head('Pop-up Messages', 'Send a message that pops up on each member\'s dashboard. It stays queued until they acknowledge it — you can see who has.') + `
    <div class="card" style="max-width:600px">
      <h3>New pop-up</h3>
      <form id="pop-new" class="mt-2">
        <div class="field"><label>Title</label><input class="input" name="title" maxlength="120" required /></div>
        <div class="field"><label>Message</label><textarea class="input" name="body" rows="3" maxlength="1000" placeholder="What do you want members to see?"></textarea></div>
        <div class="row">
          <div class="field" style="flex:1"><label>Style</label>
            <select class="input" name="level">${Object.entries(POP_STYLE).map(([k, lbl]) => `<option value="${k}">${lbl}</option>`).join('')}</select>
          </div>
          <div class="field" style="flex:1"><label>Send to</label>
            <select class="input" name="audience" id="pop-aud"><option value="all">Everyone</option><option value="user">One member</option></select>
          </div>
        </div>
        <div class="field hidden" id="pop-email-wrap"><label>Member email</label><input class="input" name="email" placeholder="member@example.com" /></div>
        <div class="row">
          <div class="field" style="flex:1"><label>Button label <span class="hint">optional</span></label><input class="input" name="ctaLabel" maxlength="40" placeholder="e.g. Fund account" /></div>
          <div class="field" style="flex:1"><label>Button link <span class="hint">optional</span></label><input class="input" name="ctaUrl" maxlength="300" placeholder="https://…" /></div>
        </div>
        <button class="btn primary block mt-1" type="submit">Send pop-up</button>
      </form>
    </div>
    <div class="card mt-3">
      <h3>Sent pop-ups</h3>
      <div class="table-wrap mt-2"><table><thead><tr><th>Message</th><th>Style</th><th>Audience</th><th>Seen</th><th>Status</th><th></th></tr></thead>
      <tbody id="pop-list">
        ${rows.length ? rows.map(popRow).join('') : '<tr><td colspan="6" class="empty">No pop-ups sent yet</td></tr>'}
      </tbody></table></div>
    </div>`;

  const audSel = $('#pop-aud');
  const emailWrap = $('#pop-email-wrap');
  audSel.addEventListener('change', () => { emailWrap.classList.toggle('hidden', audSel.value !== 'user'); });

  $('#pop-new').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      let userId = null;
      if (f.audience === 'user') {
        if (!f.email) { toast('Enter the member\'s email', 'error'); return; }
        const { data } = await api(`/admin/users?search=${encodeURIComponent(f.email)}&limit=1`, { silent: true });
        userId = data[0]?.id;
        if (!userId) { toast('No member with that email', 'warn'); return; }
      }
      await api('/admin/popups', { method: 'POST', body: {
        title: f.title, body: f.body, level: f.level,
        ctaLabel: f.ctaLabel, ctaUrl: f.ctaUrl,
        audience: f.audience, userId,
      } });
      toast('Pop-up sent', 'info');
      renderers.popups();
    } catch { /* */ } finally { btn.disabled = false; }
  });

  $('#pop-list').querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    try { await api(`/admin/popups/${b.dataset.toggle}`, { method: 'PATCH', body: { active: b.dataset.active === 'false' } }); renderers.popups(); } catch { /* */ }
  }));
  $('#pop-list').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('Delete this pop-up? Members who haven\'t seen it will no longer get it.', { title: 'Delete pop-up', confirmText: 'Delete', danger: true }))) return;
    try { await api(`/admin/popups/${b.dataset.del}`, { method: 'DELETE' }); toast('Pop-up deleted'); renderers.popups(); } catch { /* */ }
  }));
};

function popRow(p) {
  const aud = p.audience === 'user' ? (p.recipientEmail || 'One member') : 'Everyone';
  return `<tr>
    <td><b>${p.title}</b>${p.body ? `<div class="faint" style="font-size:11.5px;max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.body}</div>` : ''}</td>
    <td>${POP_STYLE[p.level] || p.level}</td>
    <td class="faint" style="font-size:12px">${aud}</td>
    <td class="mono">${p.seenCount}/${p.audienceCount}</td>
    <td><span class="tag ${p.active ? 'active' : 'closed'}">${p.active ? 'live' : 'paused'}</span></td>
    <td class="nowrap">
      <button class="btn sm ghost" data-toggle="${p.id}" data-active="${p.active}">${p.active ? 'Pause' : 'Resume'}</button>
      <button class="btn sm danger" data-del="${p.id}">Delete</button>
    </td></tr>`;
}

/* ---------------- MY PROFILE (admin's own account) ---------------- */
renderers.profile = async () => {
  const v = $('#view-profile');
  v.innerHTML = head('My Profile') + '<div class="empty">Loading…</div>';
  let p; try { p = await api('/me/profile', { silent: true }); } catch { return; }
  v.innerHTML = `
    ${head('My Profile', 'Your administrator account and the credentials you sign in with.')}
    <div class="grid cols-2">
      <div class="card"><h3>Administrator details</h3>
        <form id="ap-info" class="mt-2">
          <div class="row"><div class="field" style="flex:1"><label>First name</label><input class="input" name="firstName" value="${p.firstName || ''}" required /></div>
          <div class="field" style="flex:1"><label>Last name</label><input class="input" name="lastName" value="${p.lastName || ''}" required /></div></div>
          <div class="field"><label>Phone</label><input class="input" name="phone" value="${p.phone || ''}" /></div>
          <button class="btn primary block" type="submit">Save details</button>
        </form>
        <div class="mt-3">
          <div class="kv"><span class="k">Role</span><span>${p.role}</span></div>
          <div class="kv"><span class="k">Current sign-in email</span><span class="mono">${p.email}</span></div>
          <div class="kv"><span class="k">Last login</span><span>${p.lastLoginAt ? fmtDate(p.lastLoginAt) : '—'}</span></div>
        </div>
      </div>
      <div class="card"><h3>Sign-in email &amp; password</h3>
        <p class="muted mt-1" style="font-size:13px">Set a new email address or password to log in with. As an administrator you don't need to enter your current password. Leave a field blank to keep it unchanged.</p>
        <form id="ap-login" class="mt-2">
          <div class="field"><label>New sign-in email</label><input class="input" type="email" name="newEmail" placeholder="Current: ${p.email}" autocomplete="off" /></div>
          <div class="field"><label>New password</label><input class="input" type="password" name="newPassword" minlength="8" placeholder="At least 8 characters" autocomplete="new-password" /></div>
          <div class="field"><label>Confirm new password</label><input class="input" type="password" name="confirm" minlength="8" autocomplete="new-password" /></div>
          <button class="btn primary block" type="submit">Update sign-in details</button>
        </form>
      </div>
    </div>`;
  $('#ap-info').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      const u = await api('/me/profile', { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) });
      $('#admin-name').textContent = u.name || `${u.firstName} ${u.lastName}`.trim();
      state.admin = { ...state.admin, ...u };
      toast('Details saved', 'info');
    } catch { /* */ } finally { btn.disabled = false; }
  });
  $('#ap-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const newEmail = f.newEmail.value.trim();
    const newPassword = f.newPassword.value;
    if (!newEmail && !newPassword) return toast('Enter a new email or a new password', 'error');
    if (newPassword && newPassword !== f.confirm.value) return toast('New passwords do not match', 'error');
    const btn = f.querySelector('button'); btn.disabled = true;
    try {
      if (newEmail) await api('/auth/change-email', { method: 'POST', body: { newEmail } });
      if (newPassword) await api('/auth/change-password', { method: 'POST', body: { newPassword } });
      toast('Sign-in details updated — use them next time you log in', 'info', 6000);
      renderers.profile();
    } catch { /* */ } finally { btn.disabled = false; }
  });
};
