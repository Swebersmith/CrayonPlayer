export const videoPlatforms = [
  { id: 'qq', name: '腾讯视频', site: 'qq' },
  { id: 'iqiyi', name: '爱奇艺', site: 'qiyi' },
  { id: 'youku', name: '优酷', site: 'youku' },
  { id: 'mgtv', name: '芒果 TV', site: 'imgo' },
  { id: 'bilibili', name: '哔哩哔哩', site: 'bilibili1' },
] as const;
export type VideoPlatform = typeof videoPlatforms[number]['id'];
export const parserRoutes = [
  { id: 'native', name: '映屿 · 直链', prefix: '', note: '用于 MP4、M3U8 等媒体地址。' },
  { id: 'tx', name: 'TX · 弹幕解析', prefix: 'https://art.txnp.cn/', note: '输入视频网站的具体播放页地址。' },
  { id: 'sd', name: 'SD · 解析', prefix: 'https://bfq.txnp.cn/excessive', note: '输入视频网站的具体播放页地址。' },
  { id: 'ql', name: 'QL · 麒麟', prefix: 'https://svip.qlplayer.cyou/', note: '详情页通过服务端解析，使用 映屿 播放。' },
  { id: 'aibox', name: 'AIBox · 臻享视听', prefix: 'https://aibox.eu.org/', note: '输入视频网站的具体播放页地址；可用性取决于上游。' },
  { id: 'm1907', name: 'M1907 · 名称 / 网址', prefix: 'https://im1907.top/', note: '支持影片名称或播放页地址。' },
] as const;
export type ParserId = typeof parserRoutes[number]['id'];
export function parserRoute(id: string) {
  const route = parserRoutes.find(route => route.id === id);
  if (!route) throw new Error('未知播放线路，请重新选择。');
  return route;
}
export function httpSource(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 8192) throw new Error('请输入有效的视频地址。');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('请输入完整的 HTTP(S) 视频地址。'); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error('请使用不含用户名和密码的 HTTP(S) 视频地址。');
  return url.href;
}
export function playbackSource(value: string, id: string): string {
  parserRoute(id);
  const input = value.trim();
  if (id === 'm1907' && !/^https?:\/\//i.test(input)) {
    if (!input || input.length > 200 || /^[a-z][a-z\d+.-]*:/i.test(input)) throw new Error('请输入影片名称或完整的 HTTP(S) 播放页地址。');
    return input;
  }
  return httpSource(input);
}
export function parserPage(id: string, source: string) {
  const route = parserRoute(id);
  if (!route.prefix) throw new Error('直链播放无需解析页面。');
  const url = new URL(route.prefix);
  url.searchParams.set(id === 'm1907' ? 'jx' : 'url', playbackSource(source, id));
  return url.href;
}
/** Accept only actual official content pages; exclude home/search/ad redirects. */
export function officialPage(value: string): { url: string; platform: VideoPlatform } | undefined {
  try {
    const url = new URL(httpSource(value));
    let platform: VideoPlatform | undefined;
    if (url.hostname === 'v.qq.com' && /^\/x\/(?:cover|page)\/.+\.html$/.test(url.pathname)) platform = 'qq';
    if (/^(?:www\.)?iqiyi\.com$/.test(url.hostname) && /^\/(?:v|w)_[\w]+\.html$/.test(url.pathname)) platform = 'iqiyi';
    if (url.hostname === 'v.youku.com') {
      if (url.pathname === '/video' && /^[\w=]+$/.test(url.searchParams.get('vid') || '')) {
        url.pathname = '/v_show/id_' + url.searchParams.get('vid') + '.html'; url.search = '';
      }
      if (/^\/v_show\/id_[\w=]+\.html$/.test(url.pathname)) platform = 'youku';
    }
    if (/^(?:www|m)\.mgtv\.com$/.test(url.hostname) && /^\/b\/\d+\/\d+\.html$/.test(url.pathname)) platform = 'mgtv';
    if (/^(?:www\.)?bilibili\.com$/.test(url.hostname) && /^\/(?:bangumi\/play\/(?:ep|ss)\d+|video\/(?:BV[\w]+|av\d+))\/?$/.test(url.pathname)) platform = 'bilibili';
    if (!platform) return undefined;
    url.protocol = 'https:'; url.hash = '';
    for (const key of ['vfm', 'fv', 'tpa', 'refer', 'from', 'traceid', 'no_refer', 'bsource', 'fromvsogou', 'spm_id_from', 'cxid', 'ctid', 'theme']) url.searchParams.delete(key);
    return { platform, url: url.href };
  } catch { return undefined; }
}
export function initialParser(href: string, source: string): ParserId {
  const chosen = new URL(href).searchParams.get('parser');
  if (chosen !== null) return parserRoute(chosen).id;
  return officialPage(source) ? 'ql' : 'native';
}
export interface VideoItem {
  id: string; title: string; year: string; description: string; platforms: VideoPlatform[];
  links: { platform: VideoPlatform; url: string }[];
}
export interface VideoEpisode { title: string; url: string; platform: VideoPlatform }
export interface VideoSearchResult { items: VideoItem[]; source: string; warning?: string }
export interface VideoDetailResult { title: string; episodes: VideoEpisode[]; platforms: VideoPlatform[]; total: number }
