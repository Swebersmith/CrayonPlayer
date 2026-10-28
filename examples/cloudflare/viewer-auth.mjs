import { readMediaText } from '../../src/media-text';

const SESSION_COOKIE = '__Host-crayon-session';
const EMBED_COOKIE = '__Host-crayon-embed';
const SESSION_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const privateHeaders = () => new Headers({
  'Cache-Control': 'private, no-store',
  // Native POST forms need same-origin referrers to preserve their Origin header.
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
});

function returnPath(value, origin) {
  try {
    if (typeof value !== 'string' || value.length > 8192 || !value.startsWith('/')) return '/';
    const target = new URL(value, origin);
    if (target.origin !== origin || target.pathname.startsWith('//') || target.pathname.startsWith('/auth/')) return '/';
    return target.pathname + target.search + target.hash;
  } catch { return '/'; }
}

/** A password change also invalidates existing browser sessions. */
async function sessionKey(env) {
  const root = await crypto.subtle.importKey('raw', encoder.encode(env.MEDIA_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const derived = await crypto.subtle.sign('HMAC', root, encoder.encode('crayon-viewer-key-v1:' + env.VIEWER_PASSWORD));
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
const sessionData = (request, payload, embedded = false) => encoder.encode((embedded ? 'crayon-embed-session-v1:' : 'crayon-viewer-session-v1:') + new URL(request.url).origin + ':' + payload);
const sessionCookie = (value, seconds) => `${SESSION_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;
const embedCookie = (value, seconds) => `${EMBED_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=None; Partitioned; Max-Age=${seconds}`;
const readCookie = (request, name) => (request.headers.get('Cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1);

async function createSession(request, env, embedded = false) {
  const expiresAt = (Math.floor(Date.now() / 1000) + SESSION_SECONDS) * 1000;
  const payload = btoa(JSON.stringify({ e: expiresAt / 1000, n: crypto.randomUUID() }));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await sessionKey(env), sessionData(request, payload, embedded)));
  return { token: payload + '.' + Array.from(signature, byte => byte.toString(16).padStart(2, '0')).join(''), expiresAt };
}

async function verifySession(request, env, token, embedded = false) {
  try {
    if (!token || token.length > 512) return null;
    const [payload, signature, extra] = token.split('.');
    if (!payload || extra || !/^[0-9a-f]{64}$/.test(signature || '')) return null;
    const bytes = Uint8Array.from(signature.match(/../g), hex => parseInt(hex, 16));
    if (!await crypto.subtle.verify('HMAC', await sessionKey(env), bytes, sessionData(request, payload, embedded))) return null;
    const session = JSON.parse(atob(payload));
    const now = Math.floor(Date.now() / 1000);
    return Number.isInteger(session.e) && session.e > now && session.e <= now + SESSION_SECONDS + 60 &&
      typeof session.n === 'string' && /^[0-9a-f-]{36}$/.test(session.n) ? session : null;
  } catch { return null; }
}

export async function authorizeViewer(request, env) {
  return !!await verifySession(request, env, readCookie(request, SESSION_COOKIE));
}

export async function embeddedSession(request, env) {
  const bearer = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9+/=]+\.[0-9a-f]{64})$/)?.[1];
  return await verifySession(request, env, readCookie(request, EMBED_COOKIE), true) ||
    await verifySession(request, env, bearer, true);
}

async function validPassword(form, env) {
  const [expected, supplied] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(env.VIEWER_PASSWORD)),
    crypto.subtle.digest('SHA-256', encoder.encode(form.get('password') || '')),
  ]);
  return crypto.subtle.timingSafeEqual(expected, supplied);
}

const authJson = (body, status = 200, cookie) => {
  const headers = privateHeaders();
  headers.set('Content-Type', 'application/json; charset=UTF-8');
  if (cookie) for (const value of Array.isArray(cookie) ? cookie : [cookie]) headers.append('Set-Cookie', value);
  return new Response(JSON.stringify(body), { status, headers });
};

async function handleEmbeddedAuth(request, env, action) {
  if (action === 'session' && request.method === 'GET') {
    const session = await embeddedSession(request, env) || await verifySession(request, env, readCookie(request, SESSION_COOKIE));
    return session ? authJson({ expiresAt: session.e * 1000 }) : authJson({ error: 'UNAUTHORIZED' }, 401);
  }
  if (request.method !== 'POST' || action === 'session') return authJson({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return authJson({ error: 'INVALID_ORIGIN' }, 403);
  if (action === 'logout') return authJson({ ok: true }, 200, [embedCookie('', 0), sessionCookie('', 0)]);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')) return authJson({ error: 'INVALID_REQUEST' }, 415);
  let form;
  try { form = new URLSearchParams(await readMediaText(new Response(request.body), 32768, 10000)); }
  catch { return authJson({ error: 'INVALID_REQUEST' }, 400); }
  if (!await validPassword(form, env)) return authJson({ error: 'WRONG_PASSWORD' }, 401);
  const session = await createSession(request, env, true);
  // The fallback token is only returned to the same-origin password submission.
  // It authorizes embedded preparation, never the regular protected homepage.
  return authJson(session, 200, embedCookie(session.token, SESSION_SECONDS));
}

export function viewerLoginPage(request, message = '', status = 200, destination) {
  const url = new URL(request.url);
  const next = returnPath(destination ?? (url.pathname + url.search), url.origin);
  const headers = privateHeaders();
  headers.set('Content-Type', 'text/html; charset=UTF-8');
  headers.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="same-origin"><title>输入访问密码 · 映屿 YINGYU</title><link rel="icon" type="image/svg+xml" href="/brand/yingyu-icon.svg">
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:24px;background:#101714;color:#edf4ed;font:15px/1.6 system-ui,sans-serif}main{width:min(100%,380px);padding:32px;border:1px solid #334238;border-radius:18px;background:#18231c}.brand{font-size:12px;letter-spacing:.16em;color:#a3b7a8}h1{font-size:25px;margin:18px 0 8px}p{color:#a3b7a8;margin:0 0 24px}label{display:block;margin:0 0 8px}input,button{width:100%;font:inherit;border-radius:9px;padding:12px}input{border:1px solid #45664d;background:#101714;color:white}input:focus{outline:2px solid #9ed9ae;outline-offset:2px}button{margin-top:18px;border:0;background:#b2e0bc;color:#152c1a;font-weight:650;cursor:pointer}.error{color:#ffb4a8;margin:12px 0 0;font-size:13px}.brand{width:168px;height:58px;overflow:hidden;border-radius:10px}.brand img{display:block;width:252px;height:126px;max-width:none;transform:translate(-42px,-34px)}body{background:#0b1118;color:#f3f6fa}main{background:#151f2b;border-color:#ffffff18}button{background:#a1e6d0;color:#10251f}input{background:#0d151e;border-color:#ffffff18}</style></head>
<body><main><div class="brand"><img src="/brand/yingyu-logo-dark.png" alt="映屿 YINGYU" width="252" height="126" /></div><h1>输入访问密码</h1><p>验证后即可进入播放器。</p>
<form action="/auth/login" method="post"><input type="hidden" name="returnTo" value="${escapeHtml(next)}"><label for="password">访问密码</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus placeholder="请输入访问密码">
${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : ''}<button type="submit">进入播放器</button></form></main></body></html>`;
  return new Response(request.method === 'HEAD' ? null : html, { status, headers });
}

const redirect = (location, cookie) => {
  const headers = privateHeaders();
  headers.set('Location', location);
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
};

export async function handleViewerAuth(request, env) {
  const url = new URL(request.url);
  const embedded = url.pathname.match(/^\/auth\/embed\/(login|session|logout)$/);
  if (embedded) return handleEmbeddedAuth(request, env, embedded[1]);
  if (!['/auth/login', '/auth/logout'].includes(url.pathname)) return null;
  if (url.pathname === '/auth/login' && ['GET', 'HEAD'].includes(request.method)) return viewerLoginPage(request);
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { ...Object.fromEntries(privateHeaders()), Allow: 'POST' } });
  // Native same-origin forms send Origin. Never accept cross-origin login/logout.
  if (request.headers.get('Origin') !== url.origin) return new Response('请求来源无效', { status: 403, headers: privateHeaders() });
  if (url.pathname === '/auth/logout') return redirect('/', sessionCookie('', 0));
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/x-www-form-urlencoded'))
    return new Response('请使用密码登录表单', { status: 415, headers: privateHeaders() });
  let form;
  try { form = new URLSearchParams(await readMediaText(new Response(request.body), 32768, 10000)); }
  catch { return viewerLoginPage(request, '登录请求无效，请重试', 400, '/'); }
  const next = returnPath(form.get('returnTo'), url.origin);
  if (!await validPassword(form, env)) return viewerLoginPage(request, '密码不正确，请重试', 401, next);
  return redirect(next, sessionCookie((await createSession(request, env)).token, SESSION_SECONDS));
}
