import { videoPlatforms, VideoSearchResult, VideoDetailResult } from './library-sources';
import { searchRemoteCatalog, remoteCatalogDetail } from './videosearch';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
} });
export async function searchVideoCatalog(query: string, platform = 'all', _source = 'official'): Promise<VideoSearchResult> {
  return searchRemoteCatalog(query, platform);
}
export async function videoCatalogDetail(id: string, platform = 'all'): Promise<VideoDetailResult> {
  return remoteCatalogDetail(id, platform);
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
