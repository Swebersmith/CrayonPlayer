import { officialPage, videoPlatforms, VideoSearchResult, VideoDetailResult } from './library-sources';
import { cleanText, officialDetail, officialSearchUrl, searchOfficialPlatform } from './official-catalog';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
} });
export async function searchVideoCatalog(query: string, platform = 'all', _source = 'official'): Promise<VideoSearchResult> {
  const selected = videoPlatforms.filter(item => platform === 'all' || item.id === platform);
  const replies = await Promise.allSettled(selected.map(item => searchOfficialPlatform(query, item.id)));
  const providers = selected.map((provider, index) => {
    const reply = replies[index];
    return { platform: provider.id, name: provider.name, status: reply.status === 'fulfilled' ? reply.value.partial ? 'partial' as const : 'ok' as const : 'unavailable' as const,
      count: reply.status === 'fulfilled' ? reply.value.items.length : 0, searchUrl: officialSearchUrl(provider.id, query) };
  });
  const items = replies.flatMap(reply => reply.status === 'fulfilled' ? reply.value.items : [])
    .filter((item, index, list) => list.findIndex(other => other.id === item.id) === index);
  // Same-title movies/series and different editions remain separate. A provider
  // with results never prevents the other official sites from being searched.
  const normalized = (text: string) => cleanText(text).replace(/\s+/g, '').toLowerCase();
  items.sort((a, b) => Number(normalized(b.title) === normalized(query)) - Number(normalized(a.title) === normalized(query)));
  const unavailable = providers.filter(provider => provider.status !== 'ok');
  return { items: items.slice(0, 120), source: '正版平台直搜', providers,
    ...(unavailable.length ? { warning: unavailable.map(provider => provider.name).join('、') + '暂时无法查询，结果可能不全。可到对应官网继续搜索。' } : {}),
  };
}
export async function videoCatalogDetail(id: string, platform = 'all'): Promise<VideoDetailResult> {
  if (id.startsWith('page:')) {
    let value = ''; try { value = decodeURIComponent(id.slice(5)); } catch { throw new Error('INVALID_REQUEST'); }
    const link = officialPage(value);
    if (!link || platform !== 'all' && platform !== link.platform) throw new Error('INVALID_REQUEST');
    return { title: '官方播放页', episodes: [{ ...link, title: '播放' }], platforms: [link.platform], total: 1 };
  }
  const provider = id.split(':')[0];
  if (!['iqiyi', 'qq', 'bilibili'].includes(provider) || platform !== 'all' && platform !== provider) throw new Error('INVALID_REQUEST');
  return officialDetail(id);
}
export async function handleVideoCatalog(request: Request, authorize: (request: Request) => boolean | Promise<boolean>): Promise<Response | null> {
  const url = new URL(request.url);
  if (!['/api/player/search', '/api/player/detail'].includes(url.pathname)) return null;
  if (!await authorize(request)) return json({ error: { code: 'UNAUTHORIZED' } }, 401);
  if (request.method !== 'GET') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
  if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return json({ error: { code: 'FORBIDDEN' } }, 403);
  const platform = url.searchParams.get('platform') || 'all', source = url.searchParams.get('source') || 'official';
  const query = (url.searchParams.get('q') || '').trim(), id = url.searchParams.get('id') || '';
  if (platform !== 'all' && !videoPlatforms.some(item => item.id === platform) || !['auto', 'official'].includes(source) ||
    url.pathname.endsWith('search') && (!query || query.length > 80 || /[\u0000-\u001f]/.test(query)) || id.length > 9000) return json({ error: { code: 'INVALID_REQUEST' } }, 400);
  try { return json(url.pathname.endsWith('search') ? await searchVideoCatalog(query, platform, source) : await videoCatalogDetail(id, platform)); }
  catch (error) { return json({ error: { code: error instanceof Error && error.message === 'INVALID_REQUEST' ? 'INVALID_REQUEST' : 'CATALOG_UNAVAILABLE' } }, error instanceof Error && error.message === 'INVALID_REQUEST' ? 400 : 502); }
}
