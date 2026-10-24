import { readMediaText } from '../../src/media-text';

const SESSION_COOKIE = '__Host-crayon-session';
const SESSION_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const privateHeaders = () => new Headers({
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
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
const sessionData = (request, payload) => encoder.encode('crayon-viewer-session-v1:' + new URL(request.url).origin + ':' + payload);
const sessionCookie = (value, seconds) => `${SESSION_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;

async function createSession(request, env) {
  const payload = btoa(JSON.stringify({ e: Math.floor(Date.now() / 1000) + SESSION_SECONDS, n: crypto.randomUUID() }));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await sessionKey(env), sessionData(request, payload)));
  return payload + '.' + Array.from(signature, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function authorizeViewer(request, env) {
  try {
    const token = (request.headers.get('Cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1);
    if (!token || token.length > 512) return false;
    const [payload, signature, extra] = token.split('.');
    if (!payload || extra || !/^[0-9a-f]{64}$/.test(signature || '')) return false;
    const bytes = Uint8Array.from(signature.match(/../g), hex => parseInt(hex, 16));
    if (!await crypto.subtle.verify('HMAC', await sessionKey(env), bytes, sessionData(request, payload))) return false;
    const session = JSON.parse(atob(payload));
    const now = Math.floor(Date.now() / 1000);
    return Number.isInteger(session.e) && session.e > now && session.e <= now + SESSION_SECONDS + 60 &&
      typeof session.n === 'string' && /^[0-9a-f-]{36}$/.test(session.n);
  } catch { return false; }
}

export function viewerLoginPage(request, message = '', status = 200, destination) {
  const url = new URL(request.url);
  const next = returnPath(destination ?? (url.pathname + url.search), url.origin);
  const headers = privateHeaders();
  headers.set('Content-Type', 'text/html; charset=UTF-8');
  headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>输入访问密码 · Crayon Player</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:24px;background:#101714;color:#edf4ed;font:15px/1.6 system-ui,sans-serif}main{width:min(100%,380px);padding:32px;border:1px solid #334238;border-radius:18px;background:#18231c}.brand{font-size:12px;letter-spacing:.16em;color:#a3b7a8}h1{font-size:25px;margin:18px 0 8px}p{color:#a3b7a8;margin:0 0 24px}label{display:block;margin:0 0 8px}input,button{width:100%;font:inherit;border-radius:9px;padding:12px}input{border:1px solid #45664d;background:#101714;color:white}input:focus{outline:2px solid #9ed9ae;outline-offset:2px}button{margin-top:18px;border:0;background:#b2e0bc;color:#152c1a;font-weight:650;cursor:pointer}.error{color:#ffb4a8;margin:12px 0 0;font-size:13px}</style></head>
<body><main><div class="brand">CRAYON / PLAYER</div><h1>输入访问密码</h1><p>验证后即可进入播放器。</p>
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
  const [expected, supplied] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(env.VIEWER_PASSWORD)),
    crypto.subtle.digest('SHA-256', encoder.encode(form.get('password') || '')),
  ]);
  if (!crypto.subtle.timingSafeEqual(expected, supplied)) return viewerLoginPage(request, '密码不正确，请重试', 401, next);
  return redirect(next, sessionCookie(await createSession(request, env), SESSION_SECONDS));
}
