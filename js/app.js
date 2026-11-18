/* Resolve front end — plain JS, no build step. Talks to the FastAPI backend via api.js */
const $ = s => document.querySelector(s), app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
const chip = (v, k = 's') => `<span class="chip ${k}-${esc(v)}">${esc(String(v).replace('_', ' '))}</span>`;
const opts = (a, sel, blank) => (blank ? `<option value="">${esc(blank)}</option>` : '') + a.map(x => {
  const [v, t] = Array.isArray(x) ? x : [x, String(x).replace('_', ' ')];
  return `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(t)}</option>`;
}).join('');
const STATUS = ['submitted', 'triaged', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected', 'reopened'];
const PRIO = ['low', 'medium', 'high', 'urgent'];
const FLOW = ['submitted', 'triaged', 'assigned', 'in_progress', 'resolved', 'closed'];

let me = null, nav = 0;
const live = () => { const t = nav; return () => t === nav };            // stale-render guard for async views
const isStaff = () => me && me.role !== 'complainant', isAdmin = () => me && me.role === 'admin';

function toast(m, bad) { const t = $('#toast'); t.textContent = m; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(t._t); t._t = setTimeout(() => t.className = '', 3200) }
const fail = e => toast(e.message || 'Something went wrong', true);
const empty = t => `<div class="empty">${t}</div>`;
const skel = (n = 4) => '<div class="card">' + '<div class="skel"></div>'.repeat(n) + '</div>';

// Banner while Render wakes the API (free tier sleeps after inactivity)
let slowCount = 0;
addEventListener('api-slow', e => {
  slowCount = Math.max(0, slowCount + (e.detail ? 1 : -1));
  const b = $('#banner'); b.hidden = slowCount === 0; b.textContent = 'Waking the server — this can take up to 30 seconds on the first request…';
});
onAuthLost = () => { me = null; authView('login', 'Your session expired. Please sign in again.') };

/* ---------------- landing ---------------- */
function landing() {
  app.innerHTML = `<div class="land">
    <div class="land-hero">
      <div class="land-logo"><i>R</i>Resolve</div>
      <h1>Every customer complaint, tracked to resolution.</h1>
      <p class="land-lead">A secure ticketing platform for banks and fintechs: log issues, route them to the right team and keep a full audit trail — from the first report to a verified resolution.</p>
      <div class="land-cta">
        <button class="btn primary block" id="l-signup" style="max-width:220px">Sign up</button>
        <button class="btn alt block" id="l-login" style="max-width:220px">Sign in</button>
      </div>
      <p class="land-small">Already have an account? <a href="#" id="l-login2">Sign in</a></p>
    </div>
    <div class="land-grid">
      <div class="land-card"><div class="land-icon">💬</div><h3>File a ticket in seconds</h3><p>Customers describe what happened, pick a category and attach screenshots or a PDF statement. No forms to hunt through.</p></div>
      <div class="land-card"><div class="land-icon">🧭</div><h3>Smart triage &amp; routing</h3><p>Tickets are sorted into department queues and matched against category rules, so the right team sees them first — every time.</p></div>
      <div class="land-card"><div class="land-icon">⏱️</div><h3>SLA-friendly workflows</h3><p>Track priority, status changes and assignees. Heads of department can claim, assign, transfer and resolve, with a full activity log.</p></div>
      <div class="land-card"><div class="land-icon">🔒</div><h3>Audit trail &amp; attachments</h3><p>Every comment, status change and transfer is timestamped and attributed. Private internal notes stay hidden from customers; files are downloadable and deletable.</p></div>
      <div class="land-card"><div class="land-icon">👥</div><h3>Role-based access</h3><p>Separate experiences for complainants, agents and admins. Department members only see their own queue; administrators manage users, departments and categories.</p></div>
      <div class="land-card"><div class="land-icon">🛡️</div><h3>Built for reliability</h3><p>Rate-limited endpoints, expired-session recovery, two-step verification for logins and a wake-up banner when the API server is sleeping.</p></div>
    </div>
    <div class="land-foot">
      <div class="land-logo"><i>R</i>Resolve</div>
      <p>Complaint &amp; ticket management for banks and fintechs.</p>
      <p class="land-small">© ${new Date().getFullYear()} Resolve · <a href="#" id="l-login3">Sign in</a></p>
    </div>
  </div>`;
  $('#l-signup').onclick = e => { e.preventDefault(); authView('register') };
  $('#l-login').onclick = e => { e.preventDefault(); authView() };
  $('#l-login2').onclick = e => { e.preventDefault(); authView() };
  $('#l-login3').onclick = e => { e.preventDefault(); authView() };
}

/* ---------------- auth ---------------- */
function authFrame(inner) {
  app.innerHTML = `<div class="authwrap"><div class="hero"><div class="logo"><i>R</i>Resolve</div>
  <h2>Every customer complaint, tracked to resolution.</h2>
  <p>A secure ticketing platform for banks and fintechs: log issues, route them to the right team and keep a full audit trail.</p>
  <ul><li>Role-based access for customers, agents and admins</li><li>Department queues and SLA-friendly workflows</li><li>Private internal notes and secure attachments</li></ul></div>
  <div class="auth">${inner}</div></div>`;
}
function authView(mode = 'login', msg = '', ok = false) {
  const reg = mode === 'register';
  authFrame(`<div class="logo"><i>R</i>Resolve</div>
  <h1>${reg ? 'Create your account' : 'Welcome back'}</h1><p class="sub">${reg ? 'File complaints and follow them to resolution.' : 'Sign in to track and resolve tickets.'}</p>
  <form id="af">${reg ? '<label>Full name</label><input name="full_name" required minlength="2" maxlength="150" autocomplete="name">' : ''}
  <label>Email</label><input name="email" type="email" required autocomplete="email">
  <label>Password</label><input name="password" type="password" required minlength="${reg ? 8 : 1}" autocomplete="${reg ? 'new-password' : 'current-password'}">
  ${reg ? '<p class="hint">At least 8 characters, mixing letters with numbers or symbols.</p>' : ''}
  <button class="btn primary block">${reg ? 'Create account' : 'Sign in'}</button></form>
  <p class="${ok ? 'okmsg' : 'err'}" id="ae">${esc(msg)}</p>
  <p><a href="#" id="sw">${reg ? 'I already have an account' : 'Create an account'}</a></p>`);
  $('#sw').onclick = e => { e.preventDefault(); authView(reg ? 'login' : 'register') };
  $('#af').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); $('#ae').textContent = '';
    const bt = e.target.querySelector('button'), label = bt.textContent; bt.disabled = true; bt.textContent = 'Please wait…';
    try {
      if (reg) { await api('/auth/register', { method: 'POST', json: d, anon: true }); return authView('login', 'Account created. You can now sign in.', true) }
      const r = await api('/auth/login', { method: 'POST', json: d, anon: true });
      if (r && r.mfa_required) return mfaView(r.mfa_token);
      tok.set(r); boot();
    } catch (x) { $('#ae').textContent = x.message; bt.disabled = false; bt.textContent = label }
  };
}
function mfaView(mfa_token, useRecovery = false, msg = '') {
  authFrame(`<div class="logo"><i>R</i>Resolve</div><h1>Two-step verification</h1>
  <p class="sub">${useRecovery ? 'Enter one of your recovery codes.' : 'Enter the 6-digit code from your authenticator app.'}</p>
  <form id="mf"><label>${useRecovery ? 'Recovery code' : 'Authenticator code'}</label>
  <input name="c" required autocomplete="one-time-code" ${useRecovery ? '' : 'inputmode="numeric" maxlength="6" pattern="[0-9]{6}"'}>
  <button class="btn primary block">Verify</button></form><p class="err" id="ae">${esc(msg)}</p>
  <p><a href="#" id="sw">${useRecovery ? 'Use authenticator code' : 'Use a recovery code'}</a> · <a href="#" id="bk">Back to sign in</a></p>`);
  $('#sw').onclick = e => { e.preventDefault(); mfaView(mfa_token, !useRecovery) };
  $('#bk').onclick = e => { e.preventDefault(); authView() };
  $('#mf').onsubmit = async e => {
    e.preventDefault(); const c = e.target.c.value.trim();
    try { tok.set(await api('/auth/login/mfa', { method: 'POST', json: { mfa_token, [useRecovery ? 'recovery_code' : 'code']: c }, anon: true })); boot() }
    catch (x) { $('#ae').textContent = x.message }
  };
}

/* ---------------- profile ---------------- */
function profile() {
  const created = fmt(me.created_at);
  shell('#/profile', `<h1>Profile</h1><p class="sub">Your account details.</p>
  <div class="gu">
    <div class="card"><h2>Profile</h2>
      <table class="tbl"><tbody>
        <tr><td>Full name</td><td><b>${esc(me.full_name)}</b></td></tr>
        <tr><td>Email</td><td>${esc(me.email)}</td></tr>
        <tr><td>Role</td><td>${chip(me.role)}</td></tr>
        <tr><td>Account status</td><td>${me.is_active ? chip('active') : chip('inactive')}</td></tr>
        <tr><td>Member since</td><td>${created}</td></tr>
        <tr><td>User ID</td><td><small>${me.id}</small></td></tr>
      </tbody></table>
      <p style="margin-top:12px"><button class="btn alt" id="goSettings">⚙ Settings</button></p>
    </div>
  </div>`);
  $('#goSettings').onclick = e => { e.preventDefault(); location.hash = '#/settings' };
}
/* ---------------- settings ---------------- */
function settings() {
  const created = fmt(me.created_at);
  shell('#/settings', `<h1>Settings</h1><p class="sub">Your account details and preferences.</p>
  <div class="gu">
    <div class="card"><h2>Profile</h2>
      <table class="tbl"><tbody>
        <tr><td>Full name</td><td><b>${esc(me.full_name)}</b></td></tr>
        <tr><td>Email</td><td>${esc(me.email)}</td></tr>
        <tr><td>Role</td><td>${chip(me.role)}</td></tr>
        <tr><td>Account status</td><td>${me.is_active ? chip('active') : chip('inactive')}</td></tr>
        <tr><td>Member since</td><td>${created}</td></tr>
        <tr><td>User ID</td><td><small>${me.id}</small></td></tr>
      </tbody></table>
      <p class="hint" style="margin-top:10px">To change your name or email, or to reset your password, please contact your administrator.</p>
    </div>
    <div class="card danger-zone"><h2>Danger zone</h2>
      <p class="sub" style="margin:0 0 14px">Permanently delete your account and everything you have filed. This action cannot be undone.</p>
      <button class="btn danger sm" id="del">Delete account</button>
      <p class="hint" style="margin-top:8px">If you are an administrator, deleting your own account may leave the system without an admin. Re-create one afterwards.</p>
    </div>
  </div>`);
  $('#del').onclick = () => confirmDeleteAccount();
}

function confirmDeleteAccount() {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `<div class="modal-card"><h2>Delete account?</h2>
    <p>This will permanently remove <b>${esc(me.full_name)}</b> (${esc(me.email)}) and every ticket, comment and attachment you have filed. This cannot be undone.</p>
    <p class="hint" style="margin:10px 0">Type your email to confirm:</p>
    <input id="dc" type="email" placeholder="${esc(me.email)}" autocomplete="email">
    <p class="err" id="dce"></p>
    <div class="btns"><button class="btn alt" id="dcc">Cancel</button><button class="btn danger" id="dok">Delete account</button></div></div>`;
  document.body.appendChild(overlay);
  $('#dcc').onclick = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) overlay.remove() };
  $('#dok').onclick = async () => {
    const input = $('#dc').value.trim().toLowerCase();
    if (input !== (me.email || '').toLowerCase()) { $('#dce').textContent = 'Email does not match'; return }
    const b = $('#dok'); b.disabled = true; b.textContent = 'Deleting…';
    try {
      // The API exposes no self-delete endpoint; the only user-mutation route
      // is the admin-only PATCH /admin/users/{id} (role / is_active). Deactivating
      // the account is the closest safe action available without admin rights.
      await api(`/admin/users/${me.id}`, { method: 'PATCH', json: { is_active: false } });
      toast('Account deactivated. Contact an administrator to permanently delete it.');
      overlay.remove();
      tok.clear(); me = null; location.hash = ''; authView('login', 'Your account has been deactivated. Sign in again to reactivate it.');
    } catch (x) { $('#dce').textContent = x.message; b.disabled = false; b.textContent = 'Delete account' }
  };
}

/* ---------------- shell ---------------- */
function shell(active, html) {
  const L = [['#/mine', 'My tickets'], ['#/new', 'New ticket']];
  let groups = `<div class="group">Tickets</div>`;
  if (isStaff()) L.unshift(['#/tickets', 'Dashboard · all tickets'], ['#/queues', 'Department queues']);
  groups += L.map(([h, t]) => `<a class="nav${h === active ? ' on' : ''}" href="${h}">${t}</a>`).join('');
  if (isAdmin()) groups += `<div class="group">Administration</div>` + [['#/intake', 'Intake (triage)'], ['#/users', 'Users'], ['#/depts', 'Departments'], ['#/cats', 'Categories']]
    .map(([h, t]) => `<a class="nav${h === active ? ' on' : ''}" href="${h}">${t}</a>`).join('');
  app.innerHTML = `<div class="shell"><aside class="side" id="side"><div class="logo"><i>R</i>Resolve</div>${groups}
  <div class="me"><b>${esc(me.full_name)}</b><span>${esc(me.role)}</span><br>${esc(me.email)}<br><button class="btn sm" id="lo">Sign out</button><button class="btn sm" id="pr" style="margin-top:6px">👤 Profile</button><button class="btn sm" id="se" style="margin-top:6px">⚙ Settings</button><button class="btn sm" id="tm" style="margin-top:6px">🌓 Theme</button></div></aside>
  <main class="main"><button class="btn alt sm menu" id="mn" aria-label="Menu">☰ Menu</button>${html}</main>
  <nav class="mfoot"><a href="#/mine">🏠<br>My</a><a href="#/new">➕<br>New</a>${isStaff()?'<a href="#/tickets">📋<br>All</a><a href="#/queues">📥<br>Queue</a>':''}<a href="#/profile">👤<br>Profile</a></nav>
  <div class="mhead"><div class="logo"><i>R</i>Resolve</div><b title="${esc(me.email)}">${esc(me.full_name)}</b><button class="btn sm" id="mlo" title="Sign out">Sign out</button><button class="btn sm" id="mse" title="Settings">⚙</button></div></div>`;
$('#lo').onclick = () => { tok.clear(); me = null; location.hash = ''; authView() };
$('#mlo').onclick = () => { tok.clear(); me = null; location.hash = ''; authView() };
$('#se').onclick = e => { e.preventDefault(); location.hash = '#/settings' };
$('#pr').onclick = e => { e.preventDefault(); location.hash = '#/profile' };
$('#mse').onclick = e => { e.preventDefault(); location.hash = '#/settings' };
$('#mn').onclick = () => $('#side').classList.toggle('open');
$('#tm').onclick = () => { document.body.classList.toggle('dark'); localStorage.setItem('theme', document.body.classList.contains('dark')?'dark':'light'); };
if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');
  $('#side').onclick = e => { if (e.target.closest('a')) $('#side').classList.remove('open') };
}
const pager = p => `<div class="pager"><button class="btn alt sm" ${p.page <= 1 ? 'disabled' : ''} data-pg="${p.page - 1}">Previous</button>
  <span>Page ${p.page} of ${Math.max(1, Math.ceil(p.total / p.page_size))} · ${p.total} ${p.total === 1 ? 'item' : 'items'}</span>
  <button class="btn alt sm" ${p.page * p.page_size >= p.total ? 'disabled' : ''} data-pg="${p.page + 1}">Next</button></div>`;
const bindPager = go => document.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => go(+b.dataset.pg));

function table(items, staff) {
  if (!items.length) return empty('No tickets to show.');
  return `<div class="wrap"><table class="tbl"><thead><tr><th>Ticket</th><th>Status</th>${staff ? '<th>Priority</th><th>Department</th><th>Assignee</th>' : '<th>Category</th>'}<th>Updated</th></tr></thead><tbody>
  ${items.map(t => `<tr class="row" data-id="${t.id}"><td><b>${esc(t.title)}</b><small>${esc(t.reference)}${staff ? ' · ' + esc(t.complainant?.full_name) : ''}</small></td><td>${chip(t.status)}</td>
  ${staff ? `<td>${chip(t.priority, 'p')}</td><td>${esc(t.department?.name || 'Unrouted')}</td><td>${esc(t.assignee?.full_name || 'Unassigned')}</td>` : `<td>${esc(t.category?.name || '')}</td>`}<td>${fmt(t.updated_at)}</td></tr>`).join('')}</tbody></table></div>`;
}
const bindRows = () => document.querySelectorAll('tr.row').forEach(r => r.onclick = () => location.hash = '#/t/' + r.dataset.id);

/* ---------------- lists ---------------- */
async function mine(page = 1, status = '') {
  const ok = live();
  shell('#/mine', `<div class="top"><div><h1>My tickets</h1><p class="sub">Everything you've filed, and where it stands.</p></div><a class="btn primary" href="#/new">+ New ticket</a></div>
  <div class="bar"><select id="f" aria-label="Filter by status">${opts(STATUS, status, 'All statuses')}</select></div><div id="t">${skel()}</div>`);
  $('#f').onchange = e => mine(1, e.target.value);
  try { const p = await api('/tickets/mine?' + qs({ page, status })); if (!ok()) return; $('#t').innerHTML = table(p.items, false) + pager(p); bindRows(); bindPager(n => mine(n, status)) }
  catch (e) { if (ok()) $('#t').innerHTML = empty(esc(e.message)) }
}

async function allTickets(f = { page: 1 }) {
  const ok = live();
  shell('#/tickets', `<h1>Welcome back, ${esc(me.full_name.split(' ')[0])}</h1><p class="sub">${me.role === 'agent' ? 'Tickets in your departments.' : 'Every ticket in the system.'}</p>
  <div class="stats" id="st">${'<div class="stat"><div class="skel"></div></div>'.repeat(5)}</div>
  <div class="bar"><input type="search" id="q" placeholder="Search title or description" value="${esc(f.search || '')}" aria-label="Search">
  <select id="fs" aria-label="Status">${opts(STATUS, f.status, 'Any status')}</select><select id="fp" aria-label="Priority">${opts(PRIO, f.priority, 'Any priority')}</select>
  <select id="fd" aria-label="Department"><option value="">Any department</option></select>
  <label><input type="checkbox" id="fu" ${f.unassigned_only ? 'checked' : ''}> Unassigned only</label><button class="btn alt sm" id="clr">Clear</button></div><div id="t">${skel()}</div>`);
  const go = () => allTickets({ page: 1, search: $('#q').value.trim(), status: $('#fs').value, priority: $('#fp').value, department_id: $('#fd').value, unassigned_only: $('#fu').checked });
  $('#q').onkeydown = e => e.key === 'Enter' && go(); ['#fs', '#fp', '#fd', '#fu'].forEach(s => $(s).onchange = go); $('#clr').onclick = () => allTickets({ page: 1 });
  api('/departments').then(d => { if (ok()) $('#fd').innerHTML = opts(d.map(x => [x.id, x.name]), f.department_id, 'Any department') }).catch(() => {});
  const stat = (label, q, cls = '') => api('/tickets?' + qs({ page_size: 1, ...q })).then(r => `<div class="stat ${cls}" data-q='${JSON.stringify(q)}' tabindex="0"><span>${label}</span><b>${r.total}</b></div>`).catch(() => '');
  Promise.all([stat('Total tickets', {}), stat('Unassigned', { unassigned_only: true }), stat('In progress', { status: 'in_progress' }), stat('Urgent', { priority: 'urgent' }, 'red'), stat('Resolved', { status: 'resolved' })])
    .then(h => { if (!ok()) return; $('#st').innerHTML = h.join(''); document.querySelectorAll('.stat[data-q]').forEach(s => s.onclick = () => allTickets({ page: 1, ...JSON.parse(s.dataset.q) })) });
  try { const p = await api('/tickets?' + qs({ ...f, page_size: 20 })); if (!ok()) return; $('#t').innerHTML = table(p.items, true) + pager(p); bindRows(); bindPager(n => allTickets({ ...f, page: n })) }
  catch (e) { if (ok()) $('#t').innerHTML = empty(esc(e.message)) }
}

async function intake(page = 1) {
  const ok = live();
  shell('#/intake', `<h1>Intake</h1><p class="sub">New tickets waiting to be routed to a department (or rejected).</p><div id="t">${skel()}</div>`);
  try { const p = await api('/tickets/intake?' + qs({ page })); if (!ok()) return; $('#t').innerHTML = table(p.items, true) + pager(p); bindRows(); bindPager(intake) }
  catch (e) { if (ok()) $('#t').innerHTML = empty(esc(e.message)) }
}

async function queues(id, page = 1) {
  const ok = live();
  shell('#/queues', `<h1>Department queues</h1><p class="sub">Routed tickets nobody has claimed yet.</p><div class="bar"><select id="d" aria-label="Department"></select></div><div id="t">${skel()}</div>`);
  try {
    const d = await api('/departments?active_only=true'); if (!ok()) return;
    if (!d.length) return $('#t').innerHTML = empty('No active departments yet.');
    id = id || d[0].id; $('#d').innerHTML = opts(d.map(x => [x.id, x.name]), id); $('#d').onchange = e => queues(+e.target.value);
    const p = await api(`/departments/${id}/queue?` + qs({ page })); if (!ok()) return;
    $('#t').innerHTML = table(p.items, true) + pager(p); bindRows(); bindPager(n => queues(id, n));
  } catch (e) { if (ok()) $('#t').innerHTML = empty(esc(e.message)) }
}

/* ---------------- new ticket ---------------- */
async function newTicket() {
  const ok = live(); let cats = [], err = '';
  shell('#/new', skel());
  try { cats = await api('/categories') } catch (e) { err = e.message }
  if (!ok()) return;

  // No categories loaded at all — handle the three cases
  if (!cats.length) {
    if (err) {
      shell('#/new', `<h1>New ticket</h1><p class="sub">${esc(err)}</p><button class="btn primary" id="retry">Retry</button>`);
      $('#retry').onclick = () => newTicket();
      return;
    }
    if (isAdmin()) {
      shell('#/new', `<h1>New ticket</h1><p class="sub">No categories yet.</p>
        <div class="card"><p>Load the starter set of banking categories, then file a ticket.</p>
        <button class="btn primary" id="seed">Add starter categories</button>
        <a class="btn alt" href="#/cats" style="text-decoration:none;display:inline-block;margin-left:8px">Manage categories</a></div>`);
      $('#seed').onclick = async () => {
        const b = $('#seed'); b.disabled = true;
        try {
          for (const n of ['Failed transaction', 'Unauthorised transaction', 'Card issue', 'Account access', 'Loan / credit', 'Fees & charges', 'Staff conduct', 'Other'])
            await api('/admin/categories', { method: 'POST', json: { name: n } });
          toast('Starter categories added'); newTicket();
        } catch (x) { toast(x.message, true); b.disabled = false }
      };
      return;
    }
    shell('#/new', `<h1>New ticket</h1><p class="sub">Categories haven't been set up yet. Please contact your administrator.</p>
      <button class="btn primary" disabled>File ticket</button>
      <button class="btn alt" id="retry" style="margin-left:8px">Retry</button>`);
    $('#retry').onclick = () => newTicket();
    return;
  }

  const pick = `<div class="chips" role="radiogroup">${cats.map((c, i) => `<label class="pick"><input type="radio" name="category_id" value="${c.id}" ${i ? '' : 'required'}><span>${esc(c.name)}</span></label>`).join('')}</div>`;
  shell('#/new', `<h1>New ticket</h1><p class="sub">Tell us what happened. You can attach screenshots, photos or a PDF statement after filing.</p>
  <form id="nf" class="card" style="max-width:680px"><label>Title</label><input name="title" required minlength="5" maxlength="200" placeholder="e.g. Transfer debited but not received">
  <label>Category</label>${pick}
  <label>Description</label><textarea name="description" rows="7" required minlength="10" maxlength="10000" placeholder="Include dates, amounts and any reference numbers. Never include your PIN, password or full card number."></textarea>
  <label>Attachments</label>
  <input type="file" id="files" name="files" multiple accept="image/jpeg,image/png,image/webp,application/pdf">
  <p class="hint">Optional: JPEG, PNG, WebP or PDF. Max 5 files, 5 MB each.</p>
  <div id="flist"></div>
  <button class="btn primary">File ticket</button></form>`);

  let chosen = [];
  const fl = $('#files'), list = $('#flist');
  const renderList = () => {
    list.innerHTML = chosen.map((f, i) => {
      const kb = (f.size / 1024).toFixed(1);
      const thumb = f.type.startsWith('image/') ? `<img src="${esc(f._url)}" alt="">` : `<span class="pdf">PDF</span>`;
      return `<div class="fitem">${thumb}<span class="fname">${esc(f.name)} <small>${kb} KB</small></span><button class="btn alt sm" data-i="${i}">Remove</button></div>`;
    }).join('');
    list.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
      const i = +b.dataset.i, f = chosen[i];
      if (f._url) URL.revokeObjectURL(f._url);
      chosen.splice(i, 1); renderList();
    });
  };
  fl.onchange = () => {
    for (const f of fl.files) {
      if (chosen.length >= 5) { toast('Maximum 5 files', true); break; }
      if (f.size > 5 * 1024 * 1024) { toast(f.name + ' is over 5 MB', true); continue; }
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(f.type)) { toast(f.name + ' is not an allowed type', true); continue; }
      if (f.type.startsWith('image/')) f._url = URL.createObjectURL(f);
      chosen.push(f);
    }
    fl.value = '';
    renderList();
  };

  $('#nf').onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)); delete d.files; d.category_id = +d.category_id;
    const b = e.target.querySelector('button'); b.disabled = true;
    try {
      const t = await api('/tickets', { method: 'POST', json: d });
      if (chosen.length) {
        const total = chosen.length; let done = 0, failed = 0, errMsg = '';
        b.textContent = 'Filing…';
        for (const f of chosen) {
          const fd = new FormData(); fd.append('file', f);
          try { await api(`/tickets/${t.id}/attachments`, { method: 'POST', form: fd }); }
          catch (x) { failed++; errMsg = x.message; }
          done++;
          b.textContent = `Uploading ${done}/${total}…`;
        }
        if (failed) toast(`Ticket filed, but ${failed} attachment(s) failed: ${errMsg}. You can add them on the ticket page.`, true);
        else toast('Ticket filed');
      } else {
        toast('Ticket filed');
      }
      location.hash = '#/t/' + t.id;
    } catch (x) { fail(x); b.disabled = false }
  };
}

/* ---------------- ticket detail ---------------- */
const EVT = { created: 'Ticket created', triaged: 'Routed', rejected: 'Rejected', claimed: 'Claimed', assigned: 'Assigned', status_changed: 'Status changed', transferred: 'Transferred', reopened: 'Reopened', comment: 'Comment' };
async function detail(id) {
  const ok = live(); shell(isStaff() ? '#/tickets' : '#/mine', skel(6));
  let t; try { t = await api('/tickets/' + id) } catch (e) { return ok() && shell('', `<a href="#/${isStaff() ? 'tickets' : 'mine'}">← Back</a>` + empty(esc(e.message))) }
  if (!ok()) return;
  const staff = !!t.complainant;
  let depts = [], cats = [], members = [];
  if (staff) {
    const jobs = [api('/departments').then(r => depts = r).catch(() => {})];
    if (isAdmin()) jobs.push(api('/admin/categories').then(r => cats = r).catch(() => {}));
    if (t.department) jobs.push(api(`/admin/departments/${t.department.id}/members`).then(r => members = r).catch(() => {}));
    await Promise.all(jobs); if (!ok()) return;
  }
  const isHead = members.some(m => m.user.id === me.id && m.member_role === 'head');
  const canManage = isAdmin() || isHead, mine_ = t.assignee?.id === me.id;
  const reload = () => detail(id);
  const act = (fn, msg) => async e => { e.preventDefault(); const b = e.target.querySelector('button'); if (b) b.disabled = true; try { await fn(Object.fromEntries(new FormData(e.target))); toast(msg); reload() } catch (x) { fail(x); if (b) b.disabled = false } };
  const post = (p, json, method = 'POST') => api(`/tickets/${id}/${p}`, { method, json });
  const needsRoute = staff && isAdmin() && !t.department && t.status === 'submitted';
  const suggested = cats.find(c => c.id === t.category?.id)?.suggested_department_id;
  const reachedIdx = FLOW.indexOf(t.status === 'reopened' ? 'in_progress' : t.status);
  const back = staff ? '#/tickets' : '#/mine';

  shell(back, `<a href="${back}">← Back to tickets</a>
  <div class="top" style="margin-top:8px"><div><h1>${esc(t.title)}</h1><p class="sub">${esc(t.reference)} · filed ${fmt(t.created_at)}</p></div><div>${chip(t.status)} ${chip(t.priority, 'p')}</div></div>
  ${t.status === 'rejected' ? '' : `<div class="steps">${FLOW.map((x, i) => `<span class="${i <= Math.max(0, reachedIdx) ? 'done' : ''}">${x.replace('_', ' ')}</span>`).join('')}</div>`}
  <div class="grid2"><div>
   <div class="card"><h2>Description</h2><p style="white-space:pre-wrap;margin:0">${esc(t.description)}</p></div>
   ${t.resolution_note ? `<div class="card ok"><h2>Resolution</h2><p style="margin:0;white-space:pre-wrap">${esc(t.resolution_note)}</p>${t.resolved_at ? `<small>${fmt(t.resolved_at)}</small>` : ''}</div>` : ''}
   <div class="card"><h2>Conversation</h2>${t.comments.length ? t.comments.map(c => `<div class="cm${c.is_internal ? ' int' : ''}"><small><b>${esc(c.author.full_name)}</b> · ${fmt(c.created_at)}${c.is_internal ? ' · internal note' : ''}</small><br><span style="white-space:pre-wrap">${esc(c.body)}</span></div>`).join('') : '<p class="sub">No comments yet.</p>'}
    <form id="cf"><textarea name="body" rows="3" required maxlength="5000" placeholder="Write a comment…"></textarea>
    ${staff ? '<label class="inline"><input type="checkbox" name="is_internal"> Internal note (hidden from the complainant)</label>' : ''}<button class="btn">Add comment</button></form></div>
   ${staff && t.events.length ? `<div class="card"><h2>Activity</h2>${t.events.map(v => `<div class="ev">${fmt(v.created_at)} · ${esc(v.actor?.full_name || 'System')} · ${esc(EVT[v.event_type] || v.event_type)}${v.to_value ? `: ${esc(v.from_value || '—')} → ${esc(v.to_value)}` : ''}</div>`).join('')}</div>` : ''}
  </div><div>
   <div class="card"><h2>Details</h2><p>Category: <b>${esc(t.category?.name || '—')}</b></p>
    ${staff ? `<p>Complainant: <b>${esc(t.complainant.full_name)}</b></p><p>Department: <b>${esc(t.department?.name || 'Unrouted')}</b></p><p style="margin:0">Assignee: <b>${esc(t.assignee?.full_name || 'Unassigned')}</b></p>` : ''}</div>
   <div class="card"><h2>Attachments</h2>${t.attachments.map(a => `<div class="att"><span>${esc(a.filename)} <small>(${Math.max(1, Math.round(a.size_bytes / 1024))} KB)</small></span><span><button class="btn alt sm" data-dl="${a.id}" data-n="${esc(a.filename)}">Download</button> <button class="btn danger sm" data-rm="${a.id}">Delete</button></span></div>`).join('') || '<p class="sub">None.</p>'}
    <form id="uf"><input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" required><p class="hint">JPEG, PNG, WebP or PDF.</p><button class="btn sm">Upload</button></form></div>
   ${needsRoute ? `<div class="card tint"><h2>Triage</h2><form id="tf"><label>Department</label><select name="department_id" required>${opts(depts.filter(d => d.is_active).map(d => [d.id, d.name]), suggested, 'Choose department')}</select>
    ${suggested ? '<p class="hint">Pre-selected from the category\'s suggested department.</p>' : ''}
    <label>Priority</label><select name="priority">${opts(PRIO, t.priority)}</select>
    <label>Category</label><select name="category_id">${opts(cats.map(c => [c.id, c.name]), t.category?.id)}</select>
    <button class="btn primary">Route ticket</button></form>
    <form id="rjf"><label>Or reject (reason required)</label><input name="rejection_reason" minlength="5" maxlength="2000" required placeholder="Why is this being rejected?"><button class="btn danger sm">Reject ticket</button></form></div>` : ''}
   ${staff && t.department ? `<div class="card"><h2>Work on it</h2>
    ${!t.assignee ? '<button class="btn primary block" id="cl">Claim this ticket</button>' : ''}
    ${canManage && members.length ? `<form id="af2"><label>Assign to</label><select name="assignee_id" required>${opts(members.map(m => [m.user.id, `${m.user.full_name} (${m.member_role})`]), t.assignee?.id, 'Choose a member')}</select><button class="btn sm">Assign</button></form>` : ''}
    ${mine_ || canManage ? `<form id="sf"><label>Update status</label><select name="status" id="ss">${opts(['in_progress', 'resolved', 'closed'].filter(s => s !== t.status), '')}</select>
      <label>Resolution note <span class="hint" id="rn">(required when resolving)</span></label><textarea name="resolution_note" rows="2" maxlength="5000" minlength="5"></textarea><button class="btn sm">Save status</button></form>` : ''}
    ${canManage ? `<form id="xf"><label>Transfer to another department</label><select name="department_id" required>${opts(depts.filter(d => d.is_active && d.id !== t.department.id).map(d => [d.id, d.name]), '', 'Choose department')}</select>
      <label>Reason</label><input name="reason" required minlength="5" maxlength="2000"><button class="btn alt sm">Transfer</button></form>` : ''}</div>` : ''}
   ${['resolved', 'closed', 'rejected'].includes(t.status) ? `<div class="card"><h2>Not fixed?</h2><form id="rf"><label>Reason for reopening</label><input name="reason" required minlength="5" maxlength="2000"><button class="btn alt sm">Reopen ticket</button></form></div>` : ''}
  </div></div>`);

  $('#cf').onsubmit = act(d => post('comments', { body: d.body, is_internal: d.is_internal === 'on' }), 'Comment added');
  $('#uf').onsubmit = async e => { e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true; try { await api(`/tickets/${id}/attachments`, { method: 'POST', form: new FormData(e.target) }); toast('Uploaded'); reload() } catch (x) { fail(x); b.disabled = false } };
  document.querySelectorAll('[data-dl]').forEach(b => b.onclick = async () => {
    try { const r = await api(`/tickets/${id}/attachments/${b.dataset.dl}/download`, { raw: true }); const u = URL.createObjectURL(await r.blob()), a = document.createElement('a'); a.href = u; a.download = b.dataset.n; a.click(); URL.revokeObjectURL(u) } catch (x) { fail(x) }
  });
  document.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { if (!confirm('Delete this attachment?')) return; try { await api(`/tickets/${id}/attachments/${b.dataset.rm}`, { method: 'DELETE' }); toast('Deleted'); reload() } catch (x) { fail(x) } });
  const on = (s, fn, m) => { const el = $(s); if (el) el.onsubmit = act(fn, m) };
  on('#tf', d => post('triage', { department_id: +d.department_id, priority: d.priority, category_id: +d.category_id || null }), 'Ticket routed');
  on('#rjf', d => post('triage', { reject: true, rejection_reason: d.rejection_reason }), 'Ticket rejected');
  if ($('#cl')) $('#cl').onclick = async () => { try { await post('claim'); toast('Ticket claimed'); reload() } catch (x) { fail(x) } };
  on('#af2', d => post('assign', { assignee_id: +d.assignee_id }, 'PATCH'), 'Ticket assigned');
  on('#sf', d => { if (d.status === 'resolved' && (d.resolution_note || '').trim().length < 5) throw new Error('Add a resolution note (at least 5 characters) to resolve a ticket'); return post('status', { status: d.status, resolution_note: d.resolution_note?.trim() || null }, 'PATCH') }, 'Status updated');
  on('#xf', d => post('transfer', { department_id: +d.department_id, reason: d.reason }), 'Ticket transferred');
  on('#rf', d => post('reopen', { reason: d.reason }), 'Ticket reopened');
}

/* ---------------- admin ---------------- */
async function users(page = 1, role = '', search = '') {
  const ok = live();
  shell('#/users', `<h1>Users</h1><p class="sub">Promote agents, create admins or deactivate accounts.</p><div class="bar"><input type="search" id="q" placeholder="Search name or email" value="${esc(search)}"><select id="r">${opts(['complainant', 'agent', 'admin'], role, 'All roles')}</select></div><div id="t">${skel()}</div>`);
  const go = () => users(1, $('#r').value, $('#q').value.trim()); $('#r').onchange = go; $('#q').onkeydown = e => e.key === 'Enter' && go();
  try {
    const p = await api('/admin/users?' + qs({ page, role, search })); if (!ok()) return;
    $('#t').innerHTML = (p.items.length ? `<div class="wrap"><table class="tbl"><thead><tr><th>User</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${p.items.map(u => { const self = u.id === me.id; return `<tr><td><b>${esc(u.full_name)}</b>${self ? ' <span class="chip">you</span>' : ''}<small>${esc(u.email)}</small></td>
    <td><select data-role="${u.id}" ${self ? 'disabled' : ''}>${opts(['complainant', 'agent', 'admin'], u.role)}</select></td><td>${u.is_active ? 'Active' : 'Deactivated'}</td>
    <td>${self ? '' : `<button class="btn alt sm" data-act="${u.id}" data-on="${u.is_active}">${u.is_active ? 'Deactivate' : 'Reactivate'}</button>`}</td></tr>` }).join('')}</tbody></table></div>` : empty('No users match.')) + pager(p);
    bindPager(n => users(n, role, search));
    document.querySelectorAll('[data-role]').forEach(s => s.onchange = async () => { try { await api('/admin/users/' + s.dataset.role, { method: 'PATCH', json: { role: s.value } }); toast('Role updated') } catch (x) { fail(x); users(page, role, search) } });
    document.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => { try { await api('/admin/users/' + b.dataset.act, { method: 'PATCH', json: { is_active: b.dataset.on !== 'true' } }); users(page, role, search) } catch (x) { fail(x) } });
  } catch (e) { if (ok()) $('#t').innerHTML = empty(esc(e.message)) }
}

async function cats() {
  const ok = live();
  shell('#/cats', `<h1>Categories</h1><p class="sub">What complainants choose from when filing. The suggested department is a hint during triage.</p>
  <form id="cf2" class="bar"><input name="name" placeholder="Category name" required minlength="2" maxlength="120"><select name="suggested_department_id" id="sd"></select><button class="btn primary">Add category</button></form><div id="t">${skel(2)}</div>`);
  let d = []; try { d = await api('/departments') } catch {} if (!ok()) return;
  $('#sd').innerHTML = opts(d.map(x => [x.id, x.name]), '', 'No suggested department');
  $('#cf2').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { await api('/admin/categories', { method: 'POST', json: { name: f.name, suggested_department_id: +f.suggested_department_id || null } }); toast('Category added'); cats() } catch (x) { fail(x) } };
  try {
    const c = await api('/admin/categories'); if (!ok()) return;
    $('#t').innerHTML = c.length ? `<div class="card"><div class="chips">${c.map(x => `<span class="chip s-triaged" style="padding:6px 14px;font-size:14px;text-transform:none">${esc(x.name)}${x.suggested_department_id ? ' → ' + esc(d.find(y => y.id === x.suggested_department_id)?.name || '') : ''}</span>`).join('')}</div></div>`
      : `<div class="empty">No categories yet. Add one above, or <button class="btn sm" id="seed">add a starter set for banking</button></div>`;
    if ($('#seed')) $('#seed').onclick = async () => { try { for (const n of ['Failed transaction', 'Unauthorised transaction', 'Card issue', 'Account access', 'Loan / credit', 'Fees & charges', 'Staff conduct', 'Other']) await api('/admin/categories', { method: 'POST', json: { name: n } }); toast('Starter categories added'); cats() } catch (x) { fail(x); cats() } };
  } catch (e) { if (ok()) $('#t').innerHTML = empty(esc(e.message)) }
}

async function depts(openId) {
  const ok = live();
  shell('#/depts', `<h1>Departments</h1><p class="sub">Where tickets get routed. Add agents to a department so they can see and work its queue.</p>
  <form id="df" class="bar"><input name="name" placeholder="Department name" required minlength="2" maxlength="120"><input name="description" placeholder="Description (optional)"><button class="btn primary">Add department</button></form><div id="t">${skel()}</div><div id="mem"></div>`);
  $('#df').onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); if (!d.description) delete d.description; try { await api('/admin/departments', { method: 'POST', json: d }); toast('Department added'); depts() } catch (x) { fail(x) } };
  try {
    const d = await api('/departments'); if (!ok()) return;
    $('#t').innerHTML = d.length ? `<div class="wrap"><table class="tbl"><thead><tr><th>Name</th><th>Status</th><th></th></tr></thead><tbody>${d.map(x => `<tr><td><b>${esc(x.name)}</b><small>${esc(x.description || '')}</small></td><td>${x.is_active ? 'Active' : 'Inactive'}</td>
    <td style="white-space:nowrap"><button class="btn sm" data-m="${x.id}">Members</button> <button class="btn alt sm" data-e="${x.id}" data-n="${esc(x.name)}">Rename</button> <button class="btn alt sm" data-t="${x.id}" data-on="${x.is_active}">${x.is_active ? 'Deactivate' : 'Activate'}</button></td></tr>`).join('')}</tbody></table></div>` : empty('No departments yet. Add your first one above.');
    document.querySelectorAll('[data-t]').forEach(b => b.onclick = async () => { try { await api('/admin/departments/' + b.dataset.t, { method: 'PATCH', json: { is_active: b.dataset.on !== 'true' } }); depts() } catch (x) { fail(x) } });
    document.querySelectorAll('[data-e]').forEach(b => b.onclick = async () => { const n = prompt('New department name', b.dataset.n); if (!n || n.trim().length < 2) return; try { await api('/admin/departments/' + b.dataset.e, { method: 'PATCH', json: { name: n.trim() } }); depts() } catch (x) { fail(x) } });
    document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => members(+b.dataset.m, d.find(x => x.id === +b.dataset.m).name));
    if (openId) members(openId, d.find(x => x.id === openId)?.name || '');
  } catch (e) { if (ok()) $('#t').innerHTML = empty(esc(e.message)) }
}
async function members(id, name) {
  const box = $('#mem'); box.innerHTML = skel(3);
  try {
    const [m, u] = await Promise.all([api(`/admin/departments/${id}/members`), api('/admin/users?' + qs({ page_size: 100 }))]);
    const have = new Set(m.map(x => x.user.id)), cand = u.items.filter(x => x.role !== 'complainant' && x.is_active && !have.has(x.id));
    box.innerHTML = `<div class="card" style="margin-top:16px"><h2>${esc(name)} — members</h2>
    ${m.length ? `<div class="wrap"><table class="tbl"><tbody>${m.map(x => `<tr><td><b>${esc(x.user.full_name)}</b></td><td>${chip(x.member_role, 'm')}</td><td style="text-align:right"><button class="btn danger sm" data-rm="${x.user.id}">Remove</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">No members yet.</p>'}
    <form id="mf" class="bar" style="margin-top:14px"><select name="user_id" required>${opts(cand.map(x => [x.id, `${x.full_name} (${x.role})`]), '', cand.length ? 'Choose a staff user' : 'No agents available — promote a user first')}</select>
    <select name="member_role">${opts(['agent', 'head'], 'agent')}</select><button class="btn primary sm" ${cand.length ? '' : 'disabled'}>Add member</button></form>
    <p class="hint">Heads can assign, transfer and update tickets in this department. Promote users to "agent" on the Users page first.</p></div>`;
    $('#mf').onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); try { await api(`/admin/departments/${id}/members`, { method: 'POST', json: { user_id: +d.user_id, member_role: d.member_role } }); toast('Member added'); members(id, name) } catch (x) { fail(x) } };
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { if (!confirm('Remove this member?')) return; try { await api(`/admin/departments/${id}/members/${b.dataset.rm}`, { method: 'DELETE' }); toast('Member removed'); members(id, name) } catch (x) { fail(x) } });
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) { box.innerHTML = empty(esc(e.message)) }
}

/* ---------------- router ---------------- */
function route() {
  if (!me) { if (!location.hash) return landing(); return; }
  nav++;
  const h = location.hash || (isStaff() ? '#/tickets' : '#/mine'), m = h.match(/^#\/t\/(\d+)/);
  if (m) return detail(+m[1]);
  const adminOnly = ['#/intake', '#/users', '#/depts', '#/cats'], staffOnly = ['#/tickets', '#/queues'];
  if ((adminOnly.includes(h) && !isAdmin()) || (staffOnly.includes(h) && !isStaff())) return location.hash = isStaff() ? '#/tickets' : '#/mine';
  const R = { '#/mine': () => mine(), '#/new': newTicket, '#/tickets': () => allTickets(), '#/queues': () => queues(), '#/intake': () => intake(), '#/users': () => users(), '#/cats': cats, '#/depts': () => depts(), '#/settings': settings, '#/profile': profile };
  (R[h] || (() => location.hash = isStaff() ? '#/tickets' : '#/mine'))();
}
async function boot() {
  if (!tok.a && !tok.r) return landing();
  app.innerHTML = '<div class="authwrap"><div class="auth"><div class="logo"><i>R</i>Resolve</div>' + skel(3) + '</div></div>';
  try { me = await api('/auth/me'); route() } catch (e) { tok.clear(); authView('login', e.status === 401 ? '' : e.message) }
}
addEventListener('hashchange', route); boot();
