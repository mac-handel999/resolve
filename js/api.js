/* Resolve API client.
   Change the API address here, or run in the browser console:
   localStorage.setItem('resolve_api','http://localhost:8000')            */
const BASE = (localStorage.getItem('resolve_api') || 'https://resolve-backend-2.onrender.com').replace(/\/$/, '');

const tok = {
  get a() { return localStorage.getItem('rs_at') },
  get r() { return localStorage.getItem('rs_rt') },
  set(t) { localStorage.setItem('rs_at', t.access_token); localStorage.setItem('rs_rt', t.refresh_token) },
  clear() { localStorage.removeItem('rs_at'); localStorage.removeItem('rs_rt') }
};

let onAuthLost = () => {};          // app.js sets this: called when the session can't be recovered
let refreshing = null;              // one refresh at a time, shared by parallel requests

function refresh() {
  if (!tok.r) return Promise.resolve(false);
  if (!refreshing) {
    refreshing = fetch(BASE + '/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tok.r })
    }).then(async r => { if (!r.ok) return false; tok.set(await r.json()); return true })
      .catch(() => false)
      .finally(() => { refreshing = null });
  }
  return refreshing;
}

function errText(status, d) {
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map(x => (x.loc ? x.loc.filter(p => p !== 'body').join('.') + ': ' : '') + x.msg.replace(/^Value error, /, '')).join('; ');
  if (status === 429) return 'Too many requests. Please slow down and try again shortly.';
  if (status >= 500) return 'The server had a problem. Please try again.';
  return 'Request failed (' + status + ')';
}

/* api(path, {method, json, form, raw}) -> parsed JSON (null for 202/204) */
async function api(path, o = {}, retry = true) {
  const headers = {}; let body;
  if (tok.a && !o.anon) headers.Authorization = 'Bearer ' + tok.a;
  if (o.json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(o.json) }
  else if (o.form) body = o.form;

  // Render's free tier sleeps; tell the user if the first call is slow.
  const slow = setTimeout(() => window.dispatchEvent(new CustomEvent('api-slow', { detail: true })), 3000);
  let r;
  try { r = await fetch(BASE + path, { method: o.method || 'GET', headers, body }) }
  catch { throw new Error('Cannot reach the server. Check your connection and try again.') }
  finally { clearTimeout(slow); window.dispatchEvent(new CustomEvent('api-slow', { detail: false })) }

  if (r.status === 401 && retry && !o.anon && tok.r) {
    if (await refresh()) return api(path, o, false);
    tok.clear(); onAuthLost();
  }
  if (!r.ok) {
    let d; try { d = (await r.json()).detail } catch {}
    const e = new Error(errText(r.status, d)); e.status = r.status; throw e;
  }
  if (o.raw) return r;
  return r.status === 204 || r.status === 202 ? null : r.json();
}

const qs = o => { const p = new URLSearchParams(); for (const k in o) if (o[k] !== '' && o[k] !== false && o[k] != null) p.set(k, o[k]); return p.toString() };
