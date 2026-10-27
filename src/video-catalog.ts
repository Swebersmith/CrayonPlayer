import { readMediaText } from './media-text';
import { officialPage, videoPlatforms, VideoItem, VideoPlatform, VideoSearchResult, VideoDetailResult, VideoEpisode } from './library-sources';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
} });
const plain = (value: unknown, max = 180) => String(value || '').replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|apos);/g, value => ({ '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'" }[value]!)).replace(/\s+/g, ' ').trim().slice(0, max);
const officialLinks = (values: unknown[]): VideoItem['links'] => {
  const links: VideoItem['links'] = [];
  const candidates = values.flatMap(value => Array.isArray(value) ? value.slice(0, 100).map(item => item?.url) : [value]);
  for (const value of candidates) {
    const link = typeof value === 'string' && officialPage(value);
    if (link && !links.some(item => item.platform === link.platform)) links.push(link);
  }
  return links;
};
async function upstream(url: URL, format: 'json' | 'text') {
  // URLs are built only from the fixed provider hosts below, never user URLs.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url.href, { redirect: 'manual', signal: controller.signal, headers: { Accept: format === 'json' ? 'application/json' : 'text/html', 'User-Agent': 'Mozilla/5.0', Referer: url.hostname.endsWith('360kan.com') ? 'https://www.360kan.com/' : 'https://v.sogou.com/' } });
    if (!response.ok) { await response.body?.cancel(); throw new Error('CATALOG_UNAVAILABLE'); }
    const text = await readMediaText(response, 3 * 1024 * 1024, 8000);
    return format === 'json' ? JSON.parse(text) : text;
  } finally { clearTimeout(timer); }
}
export function catalog360(data: any): VideoItem[] {
  if (data?.code !== 0 || !Array.isArray(data?.data?.longData?.rows)) throw new Error('CATALOG_CHANGED');
  return data.data.longData.rows.slice(0, 40).flatMap((row: any) => {
    if (!/^[12346]$/.test(String(row.cat_id)) || !/^[\w-]{1,80}$/.test(String(row.en_id || ''))) return [];
    const links = officialLinks(Object.values(row.playlinks || {}));
    if (!links.length) return [];
    return [{ id: `360:${row.cat_id}:${row.en_id}`, title: plain(row.titleTxt || row.title), year: plain(row.year, 10),
      description: plain(row.description, 220), platforms: links.map(link => link.platform), links }];
  });
}
function decodeBase32(value: string) {
  if (!/^[a-z2-7]{1,14000}$/i.test(value)) return '';
  let bits = 0, buffer = 0;
  const bytes: number[] = [];
  for (const char of value.toLowerCase()) {
    buffer = buffer << 5 | 'abcdefghijklmnopqrstuvwxyz234567'.indexOf(char); bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push(buffer >>> bits & 255); }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}
/** Sogou's public result links contain a Base32-encoded destination field. */
export function catalogSogou(html: string): VideoItem[] {
  const results: VideoItem[] = [];
  for (const match of html.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi)) {
    const href = /\bhref\s*=\s*"([^"]+)"/i.exec(match[1])?.[1]?.replace(/&amp;/g, '&');
    if (!href?.startsWith('/vc/np?')) continue;
    const destination = decodeBase32(new URL(href, 'https://v.sogou.com').searchParams.get('link') || '').split('\t').pop() || '';
    const link = officialPage(destination);
    const titleAttribute = /\btitle\s*=\s*"([^"]+)"/i.exec(match[1])?.[1];
    if (!titleAttribute) continue;
    const title = plain(titleAttribute);
    if (!link || !title || results.some(item => item.links[0].url === link.url)) continue;
    results.push({ id: 'page:' + encodeURIComponent(link.url), title, year: '', description: '网页补充结果', platforms: [link.platform], links: [link] });
    if (results.length === 24) break;
  }
  return results;
}
export async function searchVideoCatalog(query: string, platform = 'all', source = 'auto'): Promise<VideoSearchResult> {
  const filter = (items: VideoItem[]) => items.map(item => ({ ...item, links: item.links.filter(link => platform === 'all' || link.platform === platform) }))
    .filter(item => item.links.length).map(item => ({ ...item, platforms: item.links.map(link => link.platform) }));
  let primaryFailed = false;
  if (source !== 'sogou') {
    try {
      const url = new URL('https://api.so.360kan.com/index');
      url.search = new URLSearchParams({ kw: query, from: 'so_result', num: '20' }).toString();
      const items = filter(catalog360(await upstream(url, 'json')));
      if (items.length || source === '360') return { items, source: '360影视' };
    } catch { primaryFailed = true; if (source === '360') throw new Error('CATALOG_UNAVAILABLE'); }
  }
  const url = new URL('https://v.sogou.com/v'); url.searchParams.set('query', query);
  const items = filter(catalogSogou(await upstream(url, 'text')));
  return { items, source: '搜狗视频', ...(primaryFailed ? { warning: '影视目录暂时不可用，已使用网页补充结果。' } : {}) };
}
export function catalogDetail(data: any, requested = 'all'): VideoDetailResult {
  const row = data?.data;
  if (data?.errno !== 0 || !row) throw new Error('CATALOG_CHANGED');
  const links = officialLinks([...Object.values(row.playlinks || {}), ...(Array.isArray(row.defaultepisode) ? row.defaultepisode : []).map((item: any) => item.url)]);
  const episodes: VideoEpisode[] = [];
  for (const group of [...Object.values(row.allepidetail || {}), row.defaultepisode]) {
    if (!Array.isArray(group)) continue;
    for (const episode of group.slice(0, 500)) {
      const link = officialPage(String(episode?.url || ''));
      if (link && (requested === 'all' || link.platform === requested) && !episodes.some(item => item.url === link.url))
        episodes.push({ ...link, title: episode.name || episode.period ? plain(episode.name || episode.period, 80) : episode.playlink_num ? `第 ${plain(episode.playlink_num, 24)} 集` : plain(episode.title || '播放') });
    }
  }
  for (const link of links) {
    if ((requested === 'all' || requested === link.platform) && !episodes.some(item => item.platform === link.platform)) episodes.push({ ...link, title: '默认播放' });
  }
  return { title: plain(row.title), episodes, platforms: links.map(link => link.platform), total: Math.min(5000, Math.max(Number(row.total) || 0, episodes.length)) };
}
export async function videoCatalogDetail(id: string, platform = 'all'): Promise<VideoDetailResult> {
  if (id.startsWith('page:')) {
    const link = officialPage(decodeURIComponent(id.slice(5)));
    if (!link || platform !== 'all' && platform !== link.platform) throw new Error('INVALID_REQUEST');
    return { title: '网页结果', episodes: [{ ...link, title: '播放' }], platforms: [link.platform], total: 1 };
  }
  const match = /^360:([12346]):([\w-]{1,80})$/.exec(id);
  if (!match) throw new Error('INVALID_REQUEST');
  const url = new URL('https://api.web.360kan.com/v1/detail');
  url.search = new URLSearchParams({ cat: match[1], id: match[2], ...(platform === 'all' ? {} : { site: videoPlatforms.find(item => item.id === platform)!.site }) }).toString();
  return catalogDetail(await upstream(url, 'json'), platform);
}
export async function handleVideoCatalog(request: Request, authorize: (request: Request) => boolean | Promise<boolean>): Promise<Response | null> {
  const url = new URL(request.url);
  if (!['/api/player/search', '/api/player/detail'].includes(url.pathname)) return null;
  if (!await authorize(request)) return json({ error: { code: 'UNAUTHORIZED' } }, 401);
  if (request.method !== 'GET') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return json({ error: { code: 'FORBIDDEN' } }, 403);
  const platform = url.searchParams.get('platform') || 'all';
  const source = url.searchParams.get('source') || 'auto';
  const query = (url.searchParams.get('q') || '').trim();
  const id = url.searchParams.get('id') || '';
  if (platform !== 'all' && !videoPlatforms.some(item => item.id === platform) || !['auto', '360', 'sogou'].includes(source) ||
    url.pathname.endsWith('search') && (!query || query.length > 80 || /[\u0000-\u001f]/.test(query)) || id.length > 9000) return json({ error: { code: 'INVALID_REQUEST' } }, 400);
  try { return json(url.pathname.endsWith('search') ? await searchVideoCatalog(query, platform, source) : await videoCatalogDetail(id, platform)); }
  catch (error) { return json({ error: { code: error instanceof Error && error.message === 'INVALID_REQUEST' ? 'INVALID_REQUEST' : 'CATALOG_UNAVAILABLE' } }, error instanceof Error && error.message === 'INVALID_REQUEST' ? 400 : 502); }
}
