import { readMediaText } from './media-text';
import { officialPage, videoPlatforms, VideoPlatform, VideoSearchResult, VideoDetailResult } from './library-sources';

const origin = 'https://videosearch.webber.qzz.io';
const remotePlatform = { qq: 'tencent', iqiyi: 'iqiyi', youku: 'youku', mgtv: 'mango', bilibili: 'bilibili' };
const localPlatform = (value: unknown) => videoPlatforms.find(item => remotePlatform[item.id] === value)?.id;
// Titles are already plain text in this API. Preserve their full contents.
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const count = (value: unknown): number => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;

function detailUrl(path: string, platform: VideoPlatform): URL {
  const url = new URL(path, origin);
  const match = /^\/v1\/([a-z]+)\/series\/([a-zA-Z0-9_=-]+)$/.exec(url.pathname);
  if (url.origin !== origin || url.username || url.password || url.hash || !match || match[1] !== remotePlatform[platform]) throw new Error('INVALID_REQUEST');
  if ([...url.searchParams.keys()].some(key => key !== 'q')) throw new Error('INVALID_REQUEST');
  return url;
}

async function request(url: URL): Promise<any> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url.href, { redirect: 'manual', signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'CrayonPlayer/0.3 VideoSearch integration' },
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('CATALOG_UNAVAILABLE'); }
    const data = JSON.parse(await readMediaText(response, 3 * 1024 * 1024, 18000));
    if (data?.ok !== true) throw new Error('CATALOG_UNAVAILABLE');
    return data;
  } finally { clearTimeout(timer); }
}

export async function searchRemoteCatalog(query: string, platform: string): Promise<VideoSearchResult> {
  const url = new URL('/v1/search', origin);
  url.search = new URLSearchParams({ q: query, view: 'series', platforms: platform === 'all' ? 'all' : remotePlatform[platform as VideoPlatform], limit: '20' }).toString();
  const data = await request(url);
  if (!Array.isArray(data.results) || !Array.isArray(data.providers)) throw new Error('CATALOG_UNAVAILABLE');
  const items = data.results.flatMap((row: any) => {
    const provider = localPlatform(row.platform), title = text(row.title);
    if (!provider || platform !== 'all' && provider !== platform || !title || !text(row.detail_url)) return [];
    let detail: URL;
    try { detail = detailUrl(row.detail_url, provider); } catch { return []; }
    const link = officialPage(text(row.url));
    return [{ id: 'videosearch:' + encodeURIComponent(detail.pathname + detail.search), title,
      year: text(row.year), type: text(row.type_name), episodeCount: count(row.total_episodes), description: '',
      platforms: [provider], links: link?.platform === provider ? [link] : [] }];
  });
  const providers = videoPlatforms.filter(item => platform === 'all' || platform === item.id).map(provider => {
    const row = data.providers.find((row: any) => localPlatform(row.platform) === provider.id);
    const status = row && ['ok', 'empty'].includes(row.status) ? 'ok' as const
      : row && ['degraded', 'stale'].includes(row.status) ? 'partial' as const : 'unavailable' as const;
    return { platform: provider.id, name: provider.name, status, count: count(row?.count), searchUrl: '' };
  });
  const failed = providers.filter(provider => provider.status !== 'ok');
  return { items, providers, source: 'VideoSearch',
    ...(failed.length ? { warning: failed.map(provider => provider.name).join('、') + '查询受限，结果可能不全。' }
      : data.partial ? { warning: '上游返回部分结果，结果可能不全。' } : {}) };
}

export async function remoteCatalogDetail(id: string, platform: string): Promise<VideoDetailResult> {
  if (!id.startsWith('videosearch:')) throw new Error('INVALID_REQUEST');
  let path: string;
  try { path = decodeURIComponent(id.slice(12)); } catch { throw new Error('INVALID_REQUEST'); }
  const provider = localPlatform(/^\/v1\/([^/]+)\//.exec(path)?.[1]);
  if (!provider || platform !== 'all' && platform !== provider) throw new Error('INVALID_REQUEST');
  const data = await request(detailUrl(path, provider));
  if (localPlatform(data.platform) !== provider || !Array.isArray(data.episodes)) throw new Error('CATALOG_UNAVAILABLE');
  const episodes = data.episodes.flatMap((row: any) => {
    const link = officialPage(text(row.url));
    return link?.platform === provider && (!row.platform || localPlatform(row.platform) === provider)
      ? [{ ...link, title: text(row.title) || (row.episode_number ? `第 ${row.episode_number} 集` : '播放') }] : [];
  });
  const warnings = Array.isArray(data.warnings) ? data.warnings.map(text).filter(Boolean) : [];
  if (data.complete === false || data.partial) warnings.unshift('分集目录尚未取齐');
  if (Array.isArray(data.missing_episode_numbers) && data.missing_episode_numbers.length) warnings.push('缺少集数：' + data.missing_episode_numbers.join('、'));
  if (episodes.length < data.episodes.length) warnings.push('部分非官方播放地址已过滤');
  return { title: text(data.series?.title), platforms: [provider], episodes, total: count(data.total),
    ...(warnings.length ? { warning: warnings.join('；') } : {}) };
}
