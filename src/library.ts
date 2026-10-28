import type Artplayer from 'artplayer';
import type { MediaPreparerAuth } from './media-client';
import { toggleCrayonFullscreen } from './fullscreen';
import { attachLibraryMenu } from './library-menu';
import { httpSource, officialPage, parserPage, parserRoute, parserRoutes, playbackSource, videoPlatforms, ParserId, VideoItem, VideoSearchResult, VideoDetailResult } from './library-sources';

export interface VideoLibraryOptions {
  source?: string;
  parser?: ParserId;
  searchEndpoint?: string | false;
  detailEndpoint?: string | false;
  resolveEndpoint?: string | false;
  auth?: MediaPreparerAuth;
  onSourceChange?: (source: string, parser: ParserId) => void;
  shareLink?: (source: string, parser: ParserId) => string;
}
export interface VideoLibraryController {
  open: () => void;
  play: (source: string, parser?: ParserId, title?: string) => Promise<void>;
  source: () => string;
  parser: () => ParserId;
  destroy: () => void;
}
interface PlaybackActions {
  suspend: () => void;
  media: (url: string, original: string, type: string, title: string) => void;
  initialUrl: string;
}
const css = `
[data-crayon-library]{font:13px/1.5 system-ui,sans-serif;color:#edf4ed;--library-accent:#b2e0bc}
[data-crayon-library] *{box-sizing:border-box}[data-crayon-library] [hidden]{display:none!important}
[data-crayon-library] button,[data-crayon-library] input,[data-crayon-library] select{font:inherit;color:inherit;border:1px solid #4b6554;border-radius:7px;background:#18281e;padding:7px 10px;min-width:0}
[data-crayon-library] button{cursor:pointer;white-space:nowrap}[data-crayon-library] button:hover{background:#304738}[data-crayon-library] button:disabled{opacity:.6;cursor:wait}
[data-crayon-library] button:focus-visible,[data-crayon-library] input:focus-visible,[data-crayon-library] select:focus-visible{outline:2px solid #b2e0bc;outline-offset:2px}
.crayon-library-bar{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:120;display:flex;justify-content:center;gap:7px;width:max-content;max-width:calc(100% - 24px);padding:9px;border:1px solid #ffffff26;border-radius:12px;background:#101b15e8;box-shadow:0 8px 28px #0006}
.crayon-library-bar button{padding:5px 9px;background:#132219e8;box-shadow:0 2px 10px #0005}
.crayon-library-wake{position:absolute;top:0;left:50%;transform:translateX(-50%);z-index:121;width:88px;height:20px;padding:0!important;border:0!important;border-radius:0 0 7px 7px!important;background:transparent!important;opacity:0;transition:opacity .15s}
.crayon-library-wake[aria-expanded=true]:hover,.crayon-library-wake:focus-visible{opacity:1;background:#132219ed!important}
.crayon-library-panel{position:absolute;inset:0;z-index:150;display:flex;flex-direction:column;background:#101b15;padding:14px;overflow:hidden;user-select:text}
.crayon-library-heading{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;font-weight:600}.crayon-library-heading strong{font-size:16px}
.crayon-library-form{display:flex;gap:6px}.crayon-library-form input{flex:1;width:100%;background:#0c1510;font-size:16px}
.crayon-library-filters{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.crayon-library-filters label{display:flex;gap:5px;align-items:center}.crayon-library-filters select{padding:5px;max-width:185px}
.crayon-library-status{margin:8px 0;color:#b9d3c0;min-height:20px;overflow-wrap:anywhere;font-size:12px}
.crayon-library-results{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:7px;padding:2px 2px 8px;touch-action:pan-y}
.crayon-library-result{text-align:left;white-space:normal!important;display:flex;flex-direction:column;gap:3px}.crayon-library-result strong{font-size:14px}.crayon-library-result span{color:#abc0b1;font-size:12px}
.crayon-library-episodes{display:flex;gap:6px;flex-wrap:wrap;align-content:flex-start}.crayon-library-episodes button{min-width:70px}
.crayon-library-platforms{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.crayon-library-platforms [aria-pressed=true]{background:#b2e0bc;color:#102416}
.crayon-library-notice{position:absolute;top:48px;left:10px;right:10px;z-index:115;padding:9px 12px;border-radius:8px;background:#14251eed;color:#d6e9db;overflow-wrap:anywhere;pointer-events:none}
.crayon-library-external{position:absolute;inset:0;width:100%;height:100%;border:0;z-index:100;background:#000}
[data-crayon-library-external=true]>.art-video,[data-crayon-library-external=true]>.art-bottom,[data-crayon-library-external=true]>.art-controls,[data-crayon-library-external=true]>.art-mask,[data-crayon-library-external=true]>.art-loading,[data-crayon-library-external=true]>.art-state,[data-crayon-library-external=true]>.art-layers{visibility:hidden}
.crayon-library-share{width:100%;margin-top:7px}
[data-crayon-library][data-compact=true] .crayon-library-panel{padding:7px}
[data-crayon-library][data-compact=true] .crayon-library-heading{margin-bottom:5px}
[data-crayon-library][data-compact=true] .crayon-library-heading strong{font-size:14px}
[data-crayon-library][data-compact=true] .crayon-library-heading button,[data-crayon-library][data-compact=true] .crayon-library-form button,[data-crayon-library][data-compact=true] .crayon-library-form input{padding:4px 7px}
[data-crayon-library][data-compact=true] .crayon-library-filters{margin-top:5px;flex-wrap:nowrap}
[data-crayon-library][data-compact=true] .crayon-library-filters label{font-size:0;gap:0;flex:1;min-width:0}
[data-crayon-library][data-compact=true] .crayon-library-filters select{font-size:11px;padding:4px;width:100%;max-width:100%}
[data-crayon-library][data-compact=true] [data-action=share]{display:none}
[data-crayon-library][data-compact=true] .crayon-library-status{margin:4px 0;font-size:11px;min-height:16px}
[data-crayon-library][data-compact=true] .crayon-library-result{padding:5px 8px}
[data-crayon-library][data-compact=true] .crayon-library-result .description{display:none}
@media(max-height:400px){.crayon-library-panel{padding:8px}.crayon-library-heading{margin-bottom:6px}.crayon-library-heading strong{font-size:14px}.crayon-library-filters{margin-top:5px}.crayon-library-status{margin:4px 0;min-height:17px}.crayon-library-filters select{max-width:145px}.crayon-library-result{padding:5px 8px!important}.crayon-library-result span.description{display:none}}
`;
const platformName = (id: string) => videoPlatforms.find(item => item.id === id)?.name || id;
const endpoint = (value: string | false | undefined, fallback: string) => value === false ? undefined : value || fallback;

/** All controls, results and provider pages belong to the actual fullscreen root. */
export function attachVideoLibrary(art: Artplayer, options: VideoLibraryOptions, playback: PlaybackActions): VideoLibraryController {
  const root = art.template.$player;
  const host = document.createElement('div'); host.dataset.crayonLibrary = '';
  const style = document.createElement('style'); style.textContent = css;
  host.innerHTML = `<button type="button" class="crayon-library-wake" data-action="menu" aria-label="打开播放器菜单" aria-expanded="false" title="打开菜单（轻触画面或按 M）">菜单</button><div class="crayon-library-bar" role="toolbar" aria-label="播放器菜单"><button type="button" data-action="search" aria-label="搜索视频">搜索</button><button type="button" data-action="routes">线路</button><button type="button" data-action="retry" aria-label="重新解析">重试</button><button type="button" data-action="fullscreen" aria-label="播放器全屏">全屏</button></div>
    <div class="crayon-library-notice" role="status" aria-live="polite" hidden></div>
    <section class="crayon-library-panel" role="dialog" aria-label="搜索与播放" hidden>
      <div class="crayon-library-heading"><strong>搜索与播放</strong><button type="button" data-action="close" aria-label="关闭搜索">关闭</button></div>
      <form class="crayon-library-form"><input type="text" aria-label="影片名称或播放页地址" placeholder="输入影片名称或具体播放页网址" autocomplete="off" maxlength="8192"><button type="submit">搜索</button><button type="button" data-action="open-source">播放</button></form>
      <div class="crayon-library-filters"><label>平台 <select data-field="platform" aria-label="视频平台"><option value="all">全部五平台</option></select></label><label>搜索 <select data-field="catalog" aria-label="搜索来源"><option value="auto">自动</option><option value="360">影视目录</option><option value="sogou">网页补充</option></select></label><label>线路 <select data-field="parser" aria-label="解析线路"></select></label><button type="button" data-action="share">播放链接</button></div>
      <div class="crayon-library-status" role="status" aria-live="polite"></div><input class="crayon-library-share" readonly aria-label="生成的播放链接" hidden>
      <div class="crayon-library-results"></div>
    </section>`;
  host.prepend(style); root.append(host);
  const panel = host.querySelector<HTMLElement>('.crayon-library-panel')!;
  const query = host.querySelector<HTMLInputElement>('.crayon-library-form input')!;
  const platform = host.querySelector<HTMLSelectElement>('[data-field=platform]')!;
  const catalog = host.querySelector<HTMLSelectElement>('[data-field=catalog]')!;
  const route = host.querySelector<HTMLSelectElement>('[data-field=parser]')!;
  const status = host.querySelector<HTMLElement>('.crayon-library-status')!;
  const notice = host.querySelector<HTMLElement>('.crayon-library-notice')!;
  const results = host.querySelector<HTMLElement>('.crayon-library-results')!;
  const share = host.querySelector<HTMLInputElement>('.crayon-library-share')!;
  const routeButton = host.querySelector<HTMLButtonElement>('[data-action=routes]')!;
  for (const item of videoPlatforms) platform.add(new Option(item.name, item.id));
  for (const item of parserRoutes) route.add(new Option(item.name, item.id));
  let source = options.source || playback.initialUrl;
  let selected: ParserId = options.parser || (officialPage(source) ? 'ql' : 'native');
  route.value = selected;
  let sourceTitle = '';
  let disposed = false, playVersion = 0, searchVersion = 0;
  let loadRequest: AbortController | undefined, searchRequest: AbortController | undefined;
  let frame: HTMLIFrameElement | undefined, frameTimer: ReturnType<typeof setTimeout> | undefined;
  let restoreFocus: HTMLElement | null = null;
  const wake = host.querySelector<HTMLButtonElement>('.crayon-library-wake')!;
  const menu = attachLibraryMenu(art, host, host.querySelector<HTMLElement>('.crayon-library-bar')!, wake, panel);
  const searchEndpoint = endpoint(options.searchEndpoint, '/api/player/search');
  const detailEndpoint = endpoint(options.detailEndpoint, '/api/player/detail');
  const resolveEndpoint = endpoint(options.resolveEndpoint, '/api/player/resolve');
  const message = (text: string, overlay = false) => { status.textContent = text; notice.textContent = text; notice.hidden = !overlay || !text; };
  const syncRoute = () => { route.value = selected; routeButton.textContent = selected === 'native' ? '线路' : parserRoute(selected).name.split(' · ')[0]; };
  const close = () => { panel.hidden = true; wake.hidden = false; menu.show(); restoreFocus?.focus(); };
  const open = () => { restoreFocus = document.activeElement as HTMLElement | null; panel.hidden = false; wake.hidden = true; menu.hide(); notice.hidden = true; query.focus(); };
  const removeFrame = () => { clearTimeout(frameTimer); frame?.remove(); frame = undefined; delete root.dataset.crayonLibraryExternal; };
  const request = async (url: string, controller: AbortController, body?: unknown) => {
    const token = options.auth?.accessToken();
    const response = await fetch(url, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.status === 401) { options.auth?.onUnauthorized(); throw new Error('登录已过期，请重新输入访问密码。'); }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      const code = data?.error?.code;
      throw new Error(code === 'RESOLVE_FAILED' ? '该线路未能解析这个播放页，请切换线路重试。' : code === 'UPSTREAM_TIMEOUT' ? '解析超时，请重试或切换线路。' : code === 'INVALID_REQUEST' ? '输入内容无效，请检查影片名称或具体播放页地址。' : body ? '解析服务暂时不可用，请重试或切换线路。' : '搜索来源暂时不可用，请重试或换一个搜索来源。');
    }
    return data;
  };
  const play = async (value: string, parser: ParserId = selected, title = sourceTitle) => {
    const validated = playbackSource(value, parser);
    const version = ++playVersion;
    searchVersion++; searchRequest?.abort(); searchRequest = undefined;
    loadRequest?.abort(); removeFrame(); playback.suspend();
    source = validated; sourceTitle = title; selected = parser; syncRoute(); share.hidden = true;
    options.onSourceChange?.(source, selected);
    close();
    if (parser === 'native') { playback.media(httpSource(source), source, '', title); message(''); return; }
    if (parser === 'ql' && resolveEndpoint) {
      const controller = new AbortController(); loadRequest = controller;
      const timer = setTimeout(() => controller.abort(), 30000);
      message('正在解析具体播放页…', true);
      try {
        const data = await request(resolveEndpoint, controller, { parser, url: source });
        if (disposed || version !== playVersion || controller.signal.aborted) return;
        playback.media(httpSource(data.url), source, data.type === 'm3u8' ? 'm3u8' : '', title);
        message('');
      } catch (error) {
        if (disposed || version !== playVersion) return;
        message(controller.signal.aborted ? '解析超时，请重试或切换线路。' : (error as Error).message, true);
      } finally { clearTimeout(timer); if (loadRequest === controller) loadRequest = undefined; }
      return;
    }
    root.dataset.crayonLibraryExternal = 'true';
    const currentFrame = document.createElement('iframe'); frame = currentFrame;
    currentFrame.className = 'crayon-library-external'; currentFrame.title = parserRoute(parser).name;
    currentFrame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media'; currentFrame.allowFullscreen = true;
    currentFrame.referrerPolicy = 'strict-origin-when-cross-origin';
    currentFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
    currentFrame.src = parserPage(parser, source);
    currentFrame.onload = () => { if (frame === currentFrame) { clearTimeout(frameTimer); message(parser === 'ql' ? '当前站点使用 QL 网页模式，可能需要域名授权。' : '网页已加载；播放结果由上游提供，可在画面内切换线路。'); } };
    currentFrame.onerror = () => { if (frame === currentFrame) message('线路加载失败，请在画面内切换线路。', true); };
    frameTimer = setTimeout(() => { if (frame === currentFrame) message('线路等待较久，可轻触画面顶部边缘打开菜单，切换线路或重试。', true); }, 20000);
    root.append(currentFrame); message('正在加载 ' + parserRoute(parser).name + '…', true);
  };
  const button = (text: string, click: () => void) => { const item = document.createElement('button'); item.type = 'button'; item.textContent = text; item.addEventListener('click', click); return item; };
  const details = async (item: VideoItem, chosen = item.links[0]?.platform || '') => {
    if (!detailEndpoint || !chosen) return;
    searchRequest?.abort(); const controller = new AbortController(); searchRequest = controller;
    const version = ++searchVersion, timer = setTimeout(() => controller.abort(), 18000);
    results.replaceChildren();
    const back = button('← 返回搜索结果', () => { void search(); });
    const heading = document.createElement('strong'); heading.textContent = item.title;
    const platforms = document.createElement('div'); platforms.className = 'crayon-library-platforms';
    for (const id of item.platforms) {
      const tab = button(platformName(id), () => { void details(item, id); }); tab.setAttribute('aria-pressed', String(id === chosen)); platforms.append(tab);
    }
    results.append(back, heading, platforms); message('正在读取分集…');
    try {
      const url = new URL(detailEndpoint, location.href); url.search = new URLSearchParams({ id: item.id, platform: chosen }).toString();
      const data = await request(url.href, controller) as VideoDetailResult;
      if (disposed || version !== searchVersion) return;
      const episodes = document.createElement('div'); episodes.className = 'crayon-library-episodes';
      for (const episode of data.episodes) {
        const link = officialPage(episode.url); if (!link || link.platform !== chosen) continue;
        episodes.append(button(episode.title, () => { void play(link.url, selected === 'native' ? 'ql' : selected, item.title + ' · ' + episode.title).catch(error => message(error.message)); }));
      }
      results.append(episodes);
      message(episodes.childElementCount ? `${platformName(chosen)} · ${episodes.childElementCount} 个可选播放页` : '这个平台暂未提供可用分集，请选择其他平台。');
    } catch (error) { if (!disposed && version === searchVersion) message(controller.signal.aborted ? '分集读取超时，请重试。' : (error as Error).message); }
    finally { clearTimeout(timer); }
  };
  const search = async () => {
    const term = query.value.trim();
    if (/^https?:\/\//i.test(term)) { await play(term, selected === 'native' && officialPage(term) ? 'ql' : selected); return; }
    if (!term || term.length > 80) { message('请输入 1–80 字的影片名称。'); return; }
    if (!searchEndpoint) { message('当前站点未启用搜索。可粘贴播放页，或选择 M1907 按名称播放。'); return; }
    searchRequest?.abort(); const controller = new AbortController(); searchRequest = controller;
    const version = ++searchVersion, timer = setTimeout(() => controller.abort(), 30000);
    results.replaceChildren(); share.hidden = true; message('正在搜索五平台播放页…');
    try {
      const url = new URL(searchEndpoint, location.href); url.search = new URLSearchParams({ q: term, platform: platform.value, source: catalog.value }).toString();
      const data = await request(url.href, controller) as VideoSearchResult;
      if (disposed || version !== searchVersion) return;
      for (const item of data.items) {
        const row = button('', () => { void details(item); }); row.className = 'crayon-library-result';
        const title = document.createElement('strong'); title.textContent = item.title;
        const meta = document.createElement('span'); meta.textContent = [item.year, item.platforms.map(platformName).join(' / ')].filter(Boolean).join(' · ');
        const description = document.createElement('span'); description.className = 'description'; description.textContent = item.description;
        row.append(title, meta, description); results.append(row);
      }
      message(`${data.source} · ${data.items.length} 条结果${data.warning ? ' · ' + data.warning : ''}${data.items.length ? '' : '；可调整名称或切换搜索来源。'}`);
    } catch (error) { if (!disposed && version === searchVersion) message(controller.signal.aborted ? '搜索超时，请重试或切换搜索来源。' : (error as Error).message); }
    finally { clearTimeout(timer); }
  };
  const onClick = (event: Event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'menu') menu.show();
    if (action === 'search') open();
    if (action === 'routes') { open(); route.focus(); }
    if (action === 'close') close();
    if (action === 'fullscreen') void toggleCrayonFullscreen(art);
    if (action === 'retry') void play(source).catch(error => message(error.message, true));
    if (action === 'open-source') void play(query.value, selected).catch(error => message(error.message));
    if (action === 'share') {
      try { share.value = options.shareLink?.(source, selected) || (selected === 'native' ? httpSource(source) : parserPage(selected, source)); share.hidden = false; share.focus(); share.select(); message('已生成播放链接，可复制使用。'); }
      catch (error) { message((error as Error).message); }
    }
  };
  host.addEventListener('click', onClick);
  for (const name of ['click', 'dblclick', 'pointerdown', 'touchstart', 'keydown']) host.addEventListener(name, event => event.stopPropagation());
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const items = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([hidden]),select'));
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  host.querySelector('form')!.addEventListener('submit', event => { event.preventDefault(); void search().catch(error => message(error.message)); });
  route.addEventListener('change', () => {
    selected = parserRoute(route.value).id; syncRoute(); message(parserRoute(selected).note);
    if (source) void play(source, selected).catch(error => { message(error.message); open(); });
  });
  platform.addEventListener('change', () => { if (query.value.trim()) void search(); });
  catalog.addEventListener('change', () => { if (query.value.trim()) void search(); });
  const resize = () => { host.dataset.compact = String(root.getBoundingClientRect().height < 340); };
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
  observer?.observe(root); window.addEventListener('resize', resize); resize();
  const destroy = () => { if (disposed) return; disposed = true; playVersion++; searchVersion++; menu.destroy(); loadRequest?.abort(); searchRequest?.abort(); observer?.disconnect(); window.removeEventListener('resize', resize); removeFrame(); host.remove(); };
  art.on('destroy', destroy); syncRoute();
  if (source && (selected !== 'native' || source !== playback.initialUrl)) void play(source, selected).catch(error => message(error.message, true));
  return { open, play, source: () => source, parser: () => selected, destroy };
}
