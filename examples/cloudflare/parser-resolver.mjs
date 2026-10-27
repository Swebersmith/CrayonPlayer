import { readMediaText } from '../../src/media-text';

const provider = 'https://svip.qlplayer.cyou/';
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
} });
function mediaUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('INVALID_REQUEST');
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
    !url.hostname.includes('.') || /^(?:\d+\.){3}\d+$/.test(url.hostname) ||
    /(?:^|\.)(?:localhost|local|internal|home|lan|invalid)$/.test(url.hostname)) throw new Error('INVALID_REQUEST');
  return url.href;
}

/** Fixed provider adapter: returns media data, never executes upstream HTML/JS. */
export async function handleParserResolver(request, authorize) {
  if (new URL(request.url).pathname !== '/api/player/resolve') return null;
  if (!await authorize(request)) return reply({ error: { code: 'UNAUTHORIZED' } }, 401);
  if (request.method !== 'POST') return reply({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return reply({ error: { code: 'FORBIDDEN' } }, 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return reply({ error: { code: 'INVALID_REQUEST' } }, 400);
  let source;
  try {
    const input = JSON.parse(await readMediaText(request, 16384, 5000));
    if (input.parser !== 'ql') throw new Error('INVALID_REQUEST');
    source = mediaUrl(input.url);
  } catch { return reply({ error: { code: 'INVALID_REQUEST' } }, 400); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  const get = async (url, limit) => {
    // Do not forward viewer cookies, bearer tokens, or upstream redirects.
    const response = await fetch(url, { redirect: 'manual', signal: controller.signal });
    if (!response.ok) { await response.body?.cancel(); throw new Error('UPSTREAM_UNAVAILABLE'); }
    return readMediaText(response, limit, 10000);
  };
  try {
    const page = new URL(provider); page.searchParams.set('url', source);
    const html = await get(page.href, 256 * 1024);
    const match = /apiToken\s*:\s*("(?:[^"\\]|\\.)*")/.exec(html);
    if (!match) throw new Error('PROVIDER_CHANGED');
    const token = JSON.parse(match[1]);
    if (typeof token !== 'string' || !token || token.length > 16384) throw new Error('PROVIDER_CHANGED');
    const api = new URL('api/resolve.php', provider); api.searchParams.set('token', token);
    const data = JSON.parse(await get(api.href, 64 * 1024));
    if (data.code !== 200 || !data.url) throw new Error('RESOLVE_FAILED');
    let url;
    try { url = mediaUrl(data.url); } catch { throw new Error('INVALID_RESPONSE'); }
    if (data.type === 'flv' || /\.flv(?:[?#]|$)/i.test(url)) throw new Error('UNSUPPORTED_MEDIA');
    return reply({ url, type: /\.m3u8(?:[?#]|$)/i.test(url) || data.type === 'm3u8' ? 'm3u8' : 'auto' });
  } catch (error) {
    const known = ['UPSTREAM_UNAVAILABLE', 'PROVIDER_CHANGED', 'RESOLVE_FAILED', 'INVALID_RESPONSE', 'UNSUPPORTED_MEDIA'];
    const code = controller.signal.aborted ? 'UPSTREAM_TIMEOUT' : known.includes(error.message) ? error.message : 'UPSTREAM_UNAVAILABLE';
    return reply({ error: { code } }, 502);
  } finally { clearTimeout(timer); }
}
