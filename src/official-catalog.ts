import { readMediaText } from './media-text';
import { officialPage, VideoDetailResult, VideoEpisode, VideoItem, VideoPlatform } from './library-sources';

export const cleanText = (value: unknown, max = 220) => String(value ?? '').replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|apos|#39);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" }[entity]!)).replace(/\s+/g, ' ').trim().slice(0, max);
const count = (value: unknown) => Math.min(5000, Math.max(0, Math.floor(Number(value) || 0)));
const pageLink = (value: unknown, platform: VideoPlatform) => {
  const link = typeof value === 'string' ? officialPage(value.startsWith('//') ? 'https:' + value : value) : undefined;
  return link?.platform === platform ? link : undefined;
};
const iqiyiSearchUrl = (query: string) => {
  const url = new URL('https://search.video.iqiyi.com/o');
  url.search = new URLSearchParams({ if: 'html5', key: query, pageNum: '1', pageSize: '20' }).toString(); return url;
};
export function officialSearchUrl(platform: VideoPlatform, query: string): string {
  const url = new URL(({ iqiyi: 'https://so.iqiyi.com/so/q_' + encodeURIComponent(query), qq: 'https://v.qq.com/x/search/', youku: 'https://so.youku.com/search_video/q_' + encodeURIComponent(query), mgtv: 'https://so.mgtv.com/so', bilibili: 'https://search.bilibili.com/all' })[platform]);
  const key = ({ qq: 'q', mgtv: 'k', bilibili: 'keyword' } as Record<string, string>)[platform];
  if (key) url.searchParams.set(key, query); return url.href;
}
const hosts = new Set(['search.video.iqiyi.com', 'pcw-api.iqiyi.com', 'pbaccess.video.qq.com', 'api.bilibili.com', 'mobileso.bz.mgtv.com', 'so.youku.com']);
/** Fixed official hosts only; never forward viewer cookies or authorization. */
export async function officialRequest(url: URL, platform: VideoPlatform, body?: unknown): Promise<any> {
  if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password) throw new Error('INVALID_REQUEST');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url.href, { method: body ? 'POST' : 'GET', redirect: 'manual', signal: controller.signal,
      headers: { Accept: platform === 'youku' ? 'text/html' : 'application/json', 'User-Agent': 'Mozilla/5.0', Referer: officialSearchUrl(platform, ''), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : { cf: { cacheEverything: true, cacheTtl: 120 } }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('CATALOG_UNAVAILABLE'); }
    const text = await readMediaText(response, 3 * 1024 * 1024, 7000);
    return platform === 'youku' ? text : JSON.parse(text);
  } finally { clearTimeout(timer); }
}
export function iqiyiCatalog(data: any): VideoItem[] {
  if (data?.code === 'A00000' && typeof data.data === 'string' && data.data.trim() === 'search result is empty') return [];
  if (data?.code !== 'A00000' || !Array.isArray(data.data?.docinfos)) throw new Error('CATALOG_CHANGED');
  return data.data.docinfos.slice(0, 40).flatMap((row: any) => {
    const album = row?.albumDocInfo;
    // Ignore clips, explainers, UGC and other sites indexed by the official search.
    if (!album || album.siteId !== 'iqiyi' || !/,(?:1|2|3|4|6|15)$/.test(album.channel || '') || !/^\d{1,18}$/.test(String(album.albumId))) return [];
    const links = [...(Array.isArray(album.videoinfos) ? album.videoinfos.map((item: any) => item?.itemLink) : []), album.albumLink]
      .map(value => pageLink(value, 'iqiyi')).filter(Boolean) as VideoItem['links'];
    const title = cleanText(album.albumTitle, 160); if (!title || !links.length) return [];
    const type = cleanText(String(album.channel).split(',')[0], 30);
    return [{ id: 'iqiyi:' + album.albumId, title, year: cleanText(album.releaseDate, 4), type, episodeCount: count(album.itemTotalNumber),
      description: cleanText([type, album.tvFocus, album.star].filter(Boolean).join(' · ')), platforms: ['iqiyi'] as VideoPlatform[], links: [links[0]], sourceUrl: iqiyiSearchUrl(title).href }];
  });
}
/** Walk only known Tencent result containers, including its main-need boxes. */
function qqRows(data: any): any[] {
  const rows: any[] = []; const queue: any[] = [data]; let visited = 0;
  while (queue.length && visited++ < 2500) {
    const node = queue.shift(); if (!node || typeof node !== 'object') continue;
    if (node.videoInfo?.coverDoc || node.videoInfo?.firstBlockSites?.length) rows.push(node);
    for (const [key, value] of Object.entries(node)) {
      if (['data', 'normalList', 'areaBoxList', 'itemList', 'nestedDocs', 'nestedBoxes', 'richDocs', 'boxes', 'boxList'].includes(key)) {
        if (Array.isArray(value)) queue.push(...value.slice(0, 150)); else if (value && typeof value === 'object') queue.push(value);
      }
    }
  } return rows;
}
function qqValidate(data: any) {
  if (data?.ret !== 0 || (data.data?.errcode ?? data.data?.errorCode) !== 0 || !Array.isArray(data.data?.normalList?.itemList)) throw new Error('CATALOG_CHANGED');
}
export function qqCatalog(data: any): VideoItem[] {
  qqValidate(data); const results: VideoItem[] = [];
  for (const row of qqRows(data)) {
    const video = row.videoInfo, id = String(row.doc?.id || '');
    if (!/^[a-zA-Z0-9]{5,40}$/.test(id) || results.some(item => item.id === 'qq:' + id)) continue;
    const site = video.episodeSites?.find((site: any) => site.enName === 'qq');
    const candidates = [...(site?.episodeInfoList || []).map((item: any) => item.url), video.playLongUrl, ...((video.playSites || []).filter((site: any) => site.enName === 'qq').map((site: any) => site.url))];
    const links = candidates.map(url => pageLink(url, 'qq')).filter(Boolean) as VideoItem['links'];
    const title = cleanText(video.title, 160); if (!title || !links.length) continue;
    results.push({ id: 'qq:' + id, title, year: video.year ? cleanText(video.year, 4) : '', type: cleanText(video.typeName, 30), episodeCount: count(site?.totalEpisode),
      description: cleanText([video.typeName, video.descrip].filter(Boolean).join(' · ')), platforms: ['qq'], links: [links[0]], sourceUrl: officialSearchUrl('qq', title) });
  } return results.slice(0, 40);
}
export function bilibiliCatalog(data: any): VideoItem[] {
  if (data?.code !== 0 || !Array.isArray(data.data?.result)) throw new Error('CATALOG_CHANGED');
  return data.data.result.slice(0, 40).flatMap((row: any) => {
    const link = pageLink(row.url, 'bilibili'), title = cleanText(row.title, 160);
    if (!['media_bangumi', 'media_ft'].includes(row.type) || !/^\d{1,12}$/.test(String(row.season_id)) || !link || !title) return [];
    return [{ id: 'bilibili:' + row.season_id, title, year: row.pubtime ? new Date(Number(row.pubtime) * 1000).getUTCFullYear().toString() : '', type: cleanText(row.season_type_name || (row.type === 'media_bangumi' ? '番剧' : '影视'), 30),
      description: cleanText(row.desc || row.description || row.index_show), episodeCount: count(row.eps?.length), platforms: ['bilibili'] as VideoPlatform[], links: [link], sourceUrl: officialSearchUrl('bilibili', title) }];
  });
}
export function mangoCatalog(data: any): VideoItem[] {
  if (data?.code !== 200 || !Array.isArray(data.data?.contents) || data.data.forbidden) throw new Error('CATALOG_UNAVAILABLE');
  const results: VideoItem[] = [];
  // Only structured programme cards with their own official source are accepted.
  for (const card of data.data.contents.slice(0, 80)) {
    const row = card.data;
    if (!row || !Array.isArray(row.sourceList)) continue;
    const site = row.sourceList.find((source: any) => source.source === 'imgo');
    if (!site) continue;
    const urls = [site.url, site.playUrl, ...(Array.isArray(site.episode) ? site.episode.map((episode: any) => episode.url) : [])];
    const link = urls.map(url => pageLink(url, 'mgtv')).find(Boolean), title = cleanText(row.title, 160);
    if (!link || !title) continue;
    results.push({ id: 'page:' + encodeURIComponent(link.url), title, year: cleanText(row.year, 4), type: cleanText(row.type, 30), description: cleanText(row.desc), platforms: ['mgtv'], links: [link], sourceUrl: officialSearchUrl('mgtv', title) });
  } return results;
}
export function youkuCatalog(html: string): VideoItem[] {
  if (/_____tmd_____|验证码|滑动验证|captcha|punish\?/i.test(html) || !/class=["'][^"']*(?:sk-mod|s-base|search-result|sk-layout)/i.test(html)) throw new Error('CATALOG_UNAVAILABLE');
  const results: VideoItem[] = [];
  for (const match of html.matchAll(/<a\b([^>]{0,4000})>([\s\S]{0,12000}?)<\/a>/gi)) {
    const href = /\bhref=["']([^"']+)["']/i.exec(match[1])?.[1]?.replace(/&amp;/g, '&'), link = pageLink(href, 'youku');
    const title = cleanText(/\btitle=["']([^"']+)["']/i.exec(match[1])?.[1] || match[2], 160);
    if (!link || !title || results.some(item => item.links[0].url === link.url)) continue;
    results.push({ id: 'page:' + encodeURIComponent(link.url), title, year: '', description: '优酷官方搜索结果', platforms: ['youku'], links: [link], sourceUrl: officialSearchUrl('youku', title) });
    if (results.length === 30) break;
  } return results;
}
const qqEndpoint = () => new URL('https://pbaccess.video.qq.com/trpc.videosearch.mobile_search.HttpMobileRecall/MbSearchHttp');
export async function searchOfficialPlatform(query: string, platform: VideoPlatform): Promise<{ items: VideoItem[]; partial?: boolean }> {
  if (platform === 'iqiyi') return { items: iqiyiCatalog(await officialRequest(iqiyiSearchUrl(query), platform)) };
  if (platform === 'qq') return { items: qqCatalog(await officialRequest(qqEndpoint(), platform, { query, pagenum: 0, pagesize: 30, version: '26022601', clientType: 1, filterValue: '', extraInfo: { multi_terminal_pc: '1' }, isneedQc: true })) };
  if (platform === 'bilibili') {
    const replies = await Promise.allSettled(['media_bangumi', 'media_ft'].map(async type => {
      const url = new URL('https://api.bilibili.com/x/web-interface/search/type'); url.search = new URLSearchParams({ search_type: type, keyword: query, page: '1' }).toString();
      return bilibiliCatalog(await officialRequest(url, platform));
    }));
    // A failed category is a partial failure, not a complete empty search.
    if (replies.every(reply => reply.status === 'rejected')) throw new Error('CATALOG_UNAVAILABLE');
    return { items: replies.flatMap(reply => reply.status === 'fulfilled' ? reply.value : []), partial: replies.some(reply => reply.status === 'rejected') };
  }
  if (platform === 'mgtv') {
    const url = new URL('https://mobileso.bz.mgtv.com/pc/search/v1'); url.search = new URLSearchParams({ q: query, pn: '1', pc: '10', corr: '1' }).toString();
    return { items: mangoCatalog(await officialRequest(url, platform)) };
  }
  return { items: youkuCatalog(await officialRequest(new URL(officialSearchUrl('youku', query)), platform)) };
}
function episodes(values: any[], platform: VideoPlatform, urlKey: string, titleKey: string): VideoEpisode[] {
  const result: VideoEpisode[] = [];
  for (const row of values.slice(0, 500)) {
    const link = pageLink(row?.[urlKey], platform);
    if (link && !result.some(episode => episode.url === link.url)) result.push({ ...link, title: cleanText(row?.[titleKey] || row?.order || '播放', 80) });
  } return result;
}
export function iqiyiEpisodes(data: any): VideoEpisode[] {
  if (data?.code !== 'A00000' || !Array.isArray(data.data?.epsodelist)) throw new Error('CATALOG_CHANGED');
  return episodes(data.data.epsodelist.filter((row: any) => row.effective !== false), 'iqiyi', 'playUrl', 'name');
}
export async function officialDetail(id: string): Promise<VideoDetailResult> {
  const match = /^(iqiyi|qq|bilibili):([\w]{1,40})$/.exec(id); if (!match) throw new Error('INVALID_REQUEST');
  const platform = match[1] as VideoPlatform, key = match[2];
  if (platform === 'iqiyi') {
    if (!/^\d{1,18}$/.test(key)) throw new Error('INVALID_REQUEST');
    const page = async (number: number) => {
      const url = new URL('https://pcw-api.iqiyi.com/albums/album/avlistinfo'); url.search = new URLSearchParams({ aid: key, size: '100', page: String(number) }).toString();
      const data = await officialRequest(url, platform); return { data: data.data, episodes: iqiyiEpisodes(data) };
    };
    const first = await page(1), total = count(first.data.total || first.data.videoCount || first.episodes.length);
    const pages = Math.min(5, Math.ceil(total / 100));
    const extra = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, index) => page(index + 2)));
    const all = [first, ...extra].flatMap(page => page.episodes).filter((episode, index, list) => list.findIndex(other => other.url === episode.url) === index);
    return { title: all[0]?.title.replace(/第\s*\d+\s*集.*$/, '') || '爱奇艺分集', platforms: ['iqiyi'], episodes: all, total, ...(total > all.length ? { warning: `官方标记 ${total} 集，本次返回 ${all.length} 个已公开播放页。` } : {}) };
  }
  if (platform === 'bilibili') {
    if (!/^\d{1,12}$/.test(key)) throw new Error('INVALID_REQUEST');
    const url = new URL('https://api.bilibili.com/pgc/view/web/season'); url.searchParams.set('season_id', key);
    const data = await officialRequest(url, platform); if (data?.code !== 0 || !Array.isArray(data.result?.episodes)) throw new Error('CATALOG_CHANGED');
    const all = episodes(data.result.episodes, platform, 'link', 'share_copy');
    return { title: cleanText(data.result.title), platforms: [platform], episodes: all, total: all.length };
  }
  const url = new URL('https://pbaccess.video.qq.com/trpc.videosearch.search_cgi.http/load_playsource_list_info');
  url.search = new URLSearchParams({ pageNum: '0', platform: '2', site: 'qq', appId: '10718', dataType: '2', id: key, scene: '8' }).toString();
  const data = await officialRequest(url, platform);
  qqValidate(data);
  const row = qqRows(data)[0]?.videoInfo, site = (row?.firstBlockSites || row?.episodeSites || []).find((site: any) => site.enName === 'qq');
  let all = episodes(site?.episodeInfoList || [], platform, 'url', 'title');
  if (!all.length) throw new Error('CATALOG_UNAVAILABLE');
  const total = count(site.totalEpisode || all.length);
  // Full mode can still contain a non-playable "..." between episode ranges.
  // Ask the same official pagination endpoint for those omitted ranges.
  if (all.length < total) {
    const extra = await Promise.allSettled(Array.from({ length: Math.min(5, Math.ceil(total / 10)) }, async (_, page) => {
      const next = new URL(url.href); next.searchParams.set('scene', '3'); next.searchParams.set('pageNum', String(page));
      const data = await officialRequest(next, platform); qqValidate(data);
      const video = qqRows(data)[0]?.videoInfo, site = (video?.firstBlockSites || video?.episodeSites || []).find((site: any) => site.enName === 'qq');
      return episodes(site?.episodeInfoList || [], platform, 'url', 'title');
    }));
    all = [...all, ...extra.flatMap(result => result.status === 'fulfilled' ? result.value : [])]
      .filter((episode, index, list) => list.findIndex(other => other.url === episode.url) === index)
      .sort((a, b) => (Number(/^(?:第)?\s*(\d+)/.exec(a.title)?.[1]) || 0) - (Number(/^(?:第)?\s*(\d+)/.exec(b.title)?.[1]) || 0)).slice(0, 500);
  }
  return { title: cleanText(row.title), platforms: [platform], episodes: all, total, ...(total > all.length ? { warning: `官方标记 ${total} 集，本次返回 ${all.length} 个已公开播放页。` } : {}) };
}
