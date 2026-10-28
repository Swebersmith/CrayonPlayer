import type Artplayer from 'artplayer';
import type { MediaPreparerAuth } from './media-client';
import { toggleCrayonFullscreen } from './fullscreen';
import { attachLibraryMenu } from './library-menu';
import { animateContent, cancelPanelMotion, morphPanel } from './player-theme';
import { readSearchHistory, writeSearchHistory } from './search-history';
import { attachMobileLibrary } from './mobile-library';
import { httpSource, officialPage, parserPage, parserRoute, parserRoutes, playbackSource, videoPlatforms, ParserId, VideoItem, VideoEpisode, VideoSearchResult, VideoDetailResult } from './library-sources';

export interface VideoLibraryOptions {
  source?: string;
  parser?: ParserId;
  searchEndpoint?: string | false;
  detailEndpoint?: string | false;
  resolveEndpoint?: string | false;
  auth?: MediaPreparerAuth;
  onSourceChange?: (source: string, parser: ParserId) => void;
  shareLink?: (source: string, parser: ParserId) => string;
  /** Optional official episode pages supplied by a host. Search selections fill this automatically. */
  episodes?: readonly VideoEpisode[];
}
export interface VideoLibraryController {
  open: () => void;
  openEpisodes: () => void;
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
[data-crayon-library]{font:13px/1.5 Inter,"Segoe UI",system-ui,sans-serif;color:var(--crayon-ink,#f3f6fa)}
[data-crayon-library] *{box-sizing:border-box}[data-crayon-library] [hidden]{display:none!important}
[data-crayon-library] button,[data-crayon-library] input,[data-crayon-library] select{font:inherit;color:inherit;border:1px solid #ffffff14;border-radius:11px;background:#ffffff06;padding:8px 12px;min-width:0}
[data-crayon-library] button{cursor:pointer;white-space:nowrap;font-weight:500}[data-crayon-library] button:hover{background:#ffffff10;border-color:#a1e6d038;color:#c6f4e7}[data-crayon-library] button:disabled{opacity:.45;cursor:wait}
[data-crayon-library] input,[data-crayon-library] select{outline:none;transition:border-color .25s,box-shadow .25s;background:#0c121a75}
[data-crayon-library] input:focus,[data-crayon-library] select:focus{border-color:#a1e6d069;box-shadow:0 0 0 3px #a1e6d00a}
.crayon-library-bar{position:absolute;top:clamp(12px,4%,24px);left:50%;transform:translateX(-50%);z-index:120;display:flex;justify-content:center;gap:3px;width:max-content;max-width:calc(100% - 24px);padding:5px;border:1px solid #ffffff18;border-radius:16px;background:var(--crayon-glass,linear-gradient(145deg,#1b2330f5,#111821f5));box-shadow:0 8px 32px #0005,inset 0 1px #ffffff05;backdrop-filter:blur(22px)}
.crayon-library-bar button{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 11px;background:transparent;border-color:transparent;border-radius:11px;font-size:12px;line-height:18px}
.crayon-library-icon{display:inline-flex;flex:none;width:16px;height:16px;opacity:.8}.crayon-library-icon svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.crayon-library-wake{position:absolute;top:0;left:50%;transform:translateX(-50%);z-index:121;width:88px;height:20px;padding:0!important;border:0!important;border-radius:0 0 8px 8px!important;background:transparent!important;opacity:0;transition:opacity .15s}
.crayon-library-wake[aria-expanded=true]:hover,.crayon-library-wake:focus-visible{opacity:1;background:#18222eed!important}
.crayon-library-panel{position:absolute;inset:68px 16px 14px;max-width:760px;margin:0 auto;z-index:150;display:flex;flex-direction:column;background:var(--crayon-glass,linear-gradient(145deg,#1b2330f5,#111821f5));border:1px solid #ffffff16;border-radius:20px;box-shadow:0 24px 80px #0008;backdrop-filter:blur(26px);padding:18px;overflow:hidden;user-select:text}
.crayon-library-heading{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}.crayon-library-heading strong{font-size:18px;line-height:1.35;font-weight:600;letter-spacing:-.02em}.crayon-library-eyebrow{display:block;font-size:9px;letter-spacing:.2em;color:#7f90a5;margin-bottom:3px}.crayon-library-heading [data-action=close]{padding:6px 9px;font-size:12px}
.crayon-library-tabs{display:flex;gap:5px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #ffffff0c}
.crayon-library-tabs button{padding:5px 14px;font-size:12px;border-color:transparent;background:transparent;color:#95a5b8}
.crayon-library-tabs [aria-selected=true]{background:#a1e6d010;border-color:#a1e6d020;color:#bdeedb}
.crayon-library-form{display:flex;gap:7px}.crayon-library-form input{flex:1;width:100%;font-size:16px;padding:8px 12px}.crayon-library-form [type=submit]{background:#a1e6d0;color:#10251f;border-color:transparent;font-weight:600}.crayon-library-form [type=submit]:hover{background:#b6eedc;color:#10251f}
.crayon-library-filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.crayon-library-filters label{display:flex;gap:7px;align-items:center;font-size:11px;color:#8496ac}.crayon-library-filters select{padding:5px 8px;max-width:180px;font-size:12px;color:#d6e0eb}.crayon-library-filters [data-action=share]{padding:5px 9px;font-size:11px}
.crayon-library-filters [data-action=history]{padding:5px 9px;font-size:11px}
.crayon-library-status{margin:9px 0;color:#8fa8b5;min-height:18px;overflow-wrap:anywhere;font-size:11px}
.crayon-library-status:empty{display:none}
.crayon-library-results,.crayon-library-episode-view,.crayon-library-route-view{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#ffffff24 transparent;padding:2px 2px 6px;touch-action:pan-y}
.crayon-library-results{display:flex;flex-direction:column;gap:8px}
.crayon-library-history-heading{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 2px 3px}.crayon-library-history-heading strong{font-size:13px;font-weight:500}.crayon-library-history-heading small{font-size:10px;color:#8395aa}
.crayon-library-history-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.crayon-library-history-item{display:flex;align-items:center;min-width:0;border:1px solid #ffffff10;border-radius:12px;background:#ffffff03;padding:3px}
.crayon-library-history-item button{background:transparent;border-color:transparent}
.crayon-library-history-term{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;padding:7px 10px!important}
.crayon-library-history-delete{flex:none;width:34px;height:34px;display:grid;place-items:center;padding:7px!important;color:#8fa1b6!important}.crayon-library-history-delete:hover{color:#f4c9c9!important;background:#ec9a9a12!important}.crayon-library-history-delete svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round}
.crayon-library-history-empty{margin:8px 2px;color:#8395aa;font-size:12px;line-height:1.7}
.crayon-library-result{text-align:left;white-space:normal!important;display:flex;flex-direction:column;gap:4px;padding:12px 14px!important;background:#ffffff03!important}.crayon-library-result:hover{background:#ffffff08!important}.crayon-library-result strong{font-size:14px;font-weight:550}.crayon-library-result span{color:#8395aa;font-size:11px;line-height:1.5}
.crayon-library-collection-title{display:block;font-size:16px;margin:3px 0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.crayon-library-episodes{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:7px;align-content:start}
.crayon-library-episodes button{min-height:36px;overflow:hidden;text-overflow:ellipsis;font-size:12px}
.crayon-library-episodes [aria-current=true]{background:#a1e6d01b;border-color:#a1e6d05c;color:#c7f4e6;box-shadow:inset 0 0 0 1px #a1e6d00d}
.crayon-library-platforms{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px}.crayon-library-platforms button{padding:5px 10px;font-size:12px}.crayon-library-platforms [aria-pressed=true]{background:#a1e6d015;color:#c3f0e0;border-color:#a1e6d03d}
.crayon-library-empty{display:grid;justify-items:start;align-content:center;gap:10px;min-height:100px;padding:10px;color:#92a3b7}.crayon-library-empty strong{font-size:15px;color:#d5dfeb}.crayon-library-empty p{font-size:12px;margin:0;line-height:1.7;max-width:440px}
.crayon-library-route-view{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-content:start}
.crayon-library-route-choice{text-align:left;white-space:normal!important;padding:12px!important}.crayon-library-route-choice strong{display:block;font-size:13px}.crayon-library-route-choice small{display:block;font-size:11px;line-height:1.5;color:#8093a9;margin-top:4px}.crayon-library-route-choice[aria-pressed=true]{border-color:#a1e6d05c;background:#a1e6d012;color:#c3f1df}
.crayon-library-notice{position:absolute;top:74px;left:16px;right:16px;z-index:115;padding:10px 14px;border:1px solid #ffffff12;border-radius:12px;background:#16212eea;color:#bdceda;font-size:12px;overflow-wrap:anywhere;pointer-events:none;backdrop-filter:blur(18px)}
.crayon-library-external{position:absolute;inset:0;width:100%;height:100%;border:0;z-index:100;background:#000}
[data-crayon-library-external=true]>.art-video,[data-crayon-library-external=true]>.art-bottom,[data-crayon-library-external=true]>.art-controls,[data-crayon-library-external=true]>.art-mask,[data-crayon-library-external=true]>.art-loading,[data-crayon-library-external=true]>.art-state,[data-crayon-library-external=true]>.art-layers{visibility:hidden}
.crayon-library-share{width:100%;margin:0 0 8px}
[data-crayon-library][data-compact=true] .crayon-library-bar{top:10px;padding:4px;gap:1px;border-radius:14px}
[data-crayon-library][data-compact=true] .crayon-library-bar button{padding:6px 10px;font-size:12px}
[data-crayon-library][data-compact=true] .crayon-library-bar .crayon-library-icon{display:none}
[data-crayon-library][data-compact=true] .crayon-library-panel{inset:7px;max-width:none;padding:8px;border-radius:14px}
[data-crayon-library][data-compact=true] .crayon-library-eyebrow{display:none}
[data-crayon-library][data-compact=true] .crayon-library-heading{margin-bottom:4px;min-height:24px}
[data-crayon-library][data-compact=true] .crayon-library-heading strong{font-size:14px}
[data-crayon-library][data-compact=true] .crayon-library-heading [data-action=close]{padding:3px 7px;font-size:11px}
[data-crayon-library][data-compact=true] .crayon-library-tabs{margin-bottom:5px;padding-bottom:4px;gap:4px}
[data-crayon-library][data-compact=true] .crayon-library-tabs button{font-size:11px;padding:2px 10px}
[data-crayon-library][data-compact=true] .crayon-library-panel[data-view=search] .crayon-library-heading{position:absolute;top:8px;right:8px;margin:0}
[data-crayon-library][data-compact=true] .crayon-library-panel[data-view=search] .crayon-library-heading>div{display:none}
[data-crayon-library][data-compact=true] .crayon-library-panel[data-view=search] .crayon-library-tabs{padding-right:48px;min-height:26px}
[data-crayon-library][data-compact=true] .crayon-library-form button,[data-crayon-library][data-compact=true] .crayon-library-form input{padding:4px 7px}
[data-crayon-library][data-compact=true] .crayon-library-filters{margin-top:5px;flex-wrap:nowrap;gap:5px}
[data-crayon-library][data-compact=true] .crayon-library-filters label{font-size:0;gap:0;flex:1;min-width:0}
[data-crayon-library][data-compact=true] .crayon-library-filters select{font-size:11px;padding:3px;width:100%;max-width:100%}
[data-crayon-library][data-compact=true] [data-action=share]{display:none}
[data-crayon-library][data-compact=true] .crayon-library-status{margin:4px 0;font-size:10px;min-height:15px}
[data-crayon-library][data-compact=true] .crayon-library-result{padding:6px 9px!important;gap:2px}
[data-crayon-library][data-compact=true] .crayon-library-result .description{display:none}
[data-crayon-library][data-compact=true] .crayon-library-history-heading{padding-top:4px}
[data-crayon-library][data-compact=true] .crayon-library-history-list{gap:5px}
[data-crayon-library][data-compact=true] .crayon-library-history-term{padding:5px 7px!important;font-size:12px}
[data-crayon-library][data-compact=true] .crayon-library-collection-title{font-size:13px;margin:2px 0 5px}
[data-crayon-library][data-compact=true] .crayon-library-platforms{margin:4px 0 7px}
[data-crayon-library][data-compact=true] .crayon-library-collection-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}
[data-crayon-library][data-compact=true] .crayon-library-collection-meta strong{margin:0;min-width:0}
[data-crayon-library][data-compact=true] .crayon-library-collection-meta .crayon-library-platforms{margin:0;flex-shrink:0}
[data-crayon-library][data-compact=true] .crayon-library-panel[data-view=episodes] .crayon-library-status{display:none}
[data-crayon-library][data-compact=true] .crayon-library-episodes{grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:5px}
[data-crayon-library][data-compact=true] .crayon-library-episodes button{min-height:30px;padding:4px 6px;font-size:11px}
@media(prefers-reduced-motion:reduce){[data-crayon-library] *{scroll-behavior:auto!important}}
@media(pointer:coarse){
  .crayon-library-wake{width:min(210px,70%);height:44px}
  .crayon-library-wake[aria-expanded=true]{pointer-events:none}
  [data-crayon-library] .crayon-library-bar{top:calc(8px + var(--crayon-safe-top,0px));max-width:calc(100% - 16px);gap:0}
  [data-crayon-library] .crayon-library-bar button{min-width:48px;min-height:44px;padding:8px 9px}
  [data-crayon-library] button{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
}
.art-video-player[data-crayon-library-mobile=true]{position:fixed!important;inset:auto!important;top:var(--crayon-mobile-top)!important;left:var(--crayon-mobile-left)!important;width:var(--crayon-mobile-width)!important;height:var(--crayon-mobile-height)!important;max-width:none!important;max-height:none!important;transform:none!important;z-index:10001!important;border-radius:0}
[data-crayon-library-mobile=true] .crayon-library-panel{inset:calc(8px + env(safe-area-inset-top,0px)) calc(8px + env(safe-area-inset-right,0px)) calc(8px + env(safe-area-inset-bottom,0px)) calc(8px + env(safe-area-inset-left,0px));padding:12px;max-width:none;display:block;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;scroll-padding:64px 0 16px;border-radius:16px}
.art-video-player[data-crayon-library-mobile=true] .crayon-library-panel[data-view] .crayon-library-heading{position:sticky;top:-12px;right:auto;z-index:3;background:#18212c;padding:8px 0;margin:0 0 8px;min-height:52px}
.art-video-player[data-crayon-library-mobile=true] .crayon-library-panel[data-view] .crayon-library-heading>div{display:block}
[data-crayon-library-mobile=true] .crayon-library-heading strong{font-size:16px}
[data-crayon-library-mobile=true] .crayon-library-panel[data-view] button{min-height:44px;font-size:14px;padding:9px 12px}
[data-crayon-library-mobile=true] .crayon-library-panel input,[data-crayon-library-mobile=true] .crayon-library-panel select{font-size:16px;min-height:44px}
.art-video-player[data-crayon-library-mobile=true] .crayon-library-panel[data-view] .crayon-library-tabs{padding:0 0 8px;margin-bottom:12px}
[data-crayon-library-mobile=true] .crayon-library-form{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px}
[data-crayon-library-mobile=true] .crayon-library-panel .crayon-library-filters{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
[data-crayon-library-mobile=true] .crayon-library-panel .crayon-library-filters label{display:flex;flex-direction:column;align-items:stretch;font-size:11px;gap:4px;color:#9daebf}
[data-crayon-library-mobile=true] .crayon-library-filters select{width:100%;max-width:none;padding:8px}
[data-crayon-library-mobile=true] .crayon-library-panel [data-action=share]{display:none}
[data-crayon-library-mobile=true] .crayon-library-status{font-size:12px;line-height:1.6;margin:12px 0}
[data-crayon-library-mobile=true] .crayon-library-results,[data-crayon-library-mobile=true] .crayon-library-episode-view,[data-crayon-library-mobile=true] .crayon-library-route-view{overflow:visible;min-height:0;margin-top:12px;padding:2px 0 12px}
[data-crayon-library-mobile=true] .crayon-library-history-list{grid-template-columns:minmax(0,1fr)}
[data-crayon-library-mobile=true] .crayon-library-panel .crayon-library-history-delete{min-width:44px;height:44px}
[data-crayon-library-mobile=true] .crayon-library-panel .crayon-library-result{padding:12px!important}
[data-crayon-library-mobile=true] .crayon-library-result strong{font-size:15px}
[data-crayon-library-mobile=true] .crayon-library-result .description{display:block}
[data-crayon-library-mobile=true] .crayon-library-episodes{grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px}
[data-crayon-library-mobile=true] .crayon-library-route-view{grid-template-columns:minmax(0,1fr)}
`;
const platformName = (id: string) => videoPlatforms.find(item => item.id === id)?.name || id;
const endpoint = (value: string | false | undefined, fallback: string) => value === false ? undefined : value || fallback;

/** All controls, results and provider pages belong to the actual fullscreen root. */
export function attachVideoLibrary(art: Artplayer, options: VideoLibraryOptions, playback: PlaybackActions): VideoLibraryController {
  const root = art.template.$player;
  const host = document.createElement('div'); host.dataset.crayonLibrary = '';
  const style = document.createElement('style'); style.textContent = css;
  const icons = { search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>', episodes: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M13 9h4M13 14h4"/>', routes: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>', retry: '<path d="M20 7v5h-5M4 17v-5h5M19 12a7 7 0 0 0-12-5L4 10m1 2a7 7 0 0 0 12 5l3-3"/>', fullscreen: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>' };
  const actionButton = (action: keyof typeof icons, label: string, aria = label) => `<button type="button" data-action="${action}" aria-label="${aria}"><span class="crayon-library-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icons[action]}</svg></span><span>${label}</span></button>`;
  host.innerHTML = `<button type="button" class="crayon-library-wake" data-action="menu" aria-label="打开播放器菜单" aria-expanded="false" title="打开菜单（轻触画面或按 M）">菜单</button><div class="crayon-library-bar" role="toolbar" aria-label="播放器菜单">${actionButton('search','搜索','搜索视频')}${actionButton('episodes','选集')}${actionButton('routes','线路')}${actionButton('retry','重试','重新解析')}${actionButton('fullscreen','全屏','播放器全屏')}</div>
    <div class="crayon-library-notice" role="status" aria-live="polite" hidden></div>
    <section class="crayon-library-panel" role="dialog" aria-label="搜索与播放" hidden>
      <div class="crayon-library-heading"><div><small class="crayon-library-eyebrow">映屿 / YINGYU</small><strong data-panel-title>发现你想看的</strong></div><button type="button" data-action="close" aria-label="关闭面板">关闭</button></div>
      <nav class="crayon-library-tabs" role="tablist" aria-label="播放器面板"><button type="button" role="tab" data-view="search" aria-selected="true">搜索</button><button type="button" role="tab" data-view="episodes" aria-selected="false">选集</button><button type="button" role="tab" data-view="routes" aria-selected="false">线路</button></nav>
      <form class="crayon-library-form"><input type="text" aria-label="影片名称或播放页地址" placeholder="搜索片名，或粘贴播放页网址" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" maxlength="8192"><button type="submit">搜索</button><button type="button" data-action="open-source">播放</button></form>
      <div class="crayon-library-filters"><label>平台 <select data-field="platform" aria-label="视频平台"><option value="all">全部五平台</option></select></label><label>线路 <select data-field="parser" aria-label="解析线路"></select></label><button type="button" data-action="history">历史记录</button><button type="button" data-action="share">播放链接</button></div>
      <div class="crayon-library-status" role="status" aria-live="polite"></div><input class="crayon-library-share" readonly aria-label="生成的播放链接" hidden>
      <div class="crayon-library-results"></div>
      <div class="crayon-library-episode-view" hidden></div><div class="crayon-library-route-view" hidden></div>
    </section>`;
  host.prepend(style); root.append(host);
  const panel = host.querySelector<HTMLElement>('.crayon-library-panel')!;
  const mobile = attachMobileLibrary(art);
  const query = host.querySelector<HTMLInputElement>('.crayon-library-form input')!;
  const platform = host.querySelector<HTMLSelectElement>('[data-field=platform]')!;
  const route = host.querySelector<HTMLSelectElement>('[data-field=parser]')!;
  const status = host.querySelector<HTMLElement>('.crayon-library-status')!;
  const notice = host.querySelector<HTMLElement>('.crayon-library-notice')!;
  const results = host.querySelector<HTMLElement>('.crayon-library-results')!;
  const episodeView = host.querySelector<HTMLElement>('.crayon-library-episode-view')!;
  const routeView = host.querySelector<HTMLElement>('.crayon-library-route-view')!;
  const filters = host.querySelector<HTMLElement>('.crayon-library-filters')!;
  const sourceForm = host.querySelector<HTMLFormElement>('.crayon-library-form')!;
  const share = host.querySelector<HTMLInputElement>('.crayon-library-share')!;
  const routeButton = host.querySelector<HTMLButtonElement>('[data-action=routes]')!;
  for (const item of videoPlatforms) platform.add(new Option(item.name, item.id));
  for (const item of parserRoutes) route.add(new Option(item.name, item.id));
  let source = options.source || playback.initialUrl;
  let selected: ParserId = options.parser || (officialPage(source) ? 'ql' : 'native');
  route.value = selected;
  let sourceTitle = '';
  let history = readSearchHistory();
  let showingHistory = true;
  type Collection = { item: VideoItem; platform: string; detail: VideoDetailResult };
  let collection: Collection | undefined;
  let panelOrigin: DOMRect | undefined;
  let panelVersion = 0;
  let panelClosing = false;
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
  const syncRoute = () => { route.value = selected; routeButton.title = '当前线路：' + parserRoute(selected).name; };
  const setView = (view: 'search' | 'episodes' | 'routes') => {
    panel.dataset.view = view;
    panel.setAttribute('aria-label', view === 'search' ? '搜索与播放' : view === 'episodes' ? '选集' : '播放线路');
    host.querySelector<HTMLElement>('[data-panel-title]')!.textContent = view === 'search' ? '发现你想看的' : view === 'episodes' ? '选择剧集' : '选择播放线路';
    sourceForm.hidden = filters.hidden = results.hidden = view !== 'search';
    episodeView.hidden = view !== 'episodes'; routeView.hidden = view !== 'routes'; share.hidden = true;
    host.querySelectorAll<HTMLButtonElement>('.crayon-library-tabs [data-view]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.view === view)));
    if (view === 'search' && showingHistory) { renderHistory(); message(''); }
    if (view === 'episodes') renderEpisodes();
    if (view === 'routes') renderRoutes();
  };
  const close = () => {
    if (panel.hidden) { wake.hidden = false; menu.show(); return; }
    if (panelClosing) return;
    panelClosing = true;
    const version = ++panelVersion;
    void morphPanel(root, panel, panelOrigin, false).then(done => {
      if (!done || disposed || version !== panelVersion) return;
      panelClosing = false;
      mobile.close(); wake.hidden = false; menu.show(); restoreFocus?.focus({ preventScroll: true });
    });
  };
  const openView = (view: 'search' | 'episodes' | 'routes', trigger?: HTMLElement) => {
    panelVersion++;
    const opening = panel.hidden;
    const reopening = panelClosing;
    panelClosing = false;
    if (opening) {
      restoreFocus = document.activeElement as HTMLElement | null;
      panelOrigin = (trigger || host.querySelector<HTMLElement>(`[data-action=${view}]`))?.getBoundingClientRect();
    }
    mobile.open(); setView(view); panel.scrollTop = 0; wake.hidden = true; menu.hide(); notice.hidden = true;
    if (opening || reopening) void morphPanel(root, panel, panelOrigin, true);
    else animateContent(view === 'episodes' ? episodeView : view === 'routes' ? routeView : results);
    if (view === 'search' && !mobile.active()) query.focus({ preventScroll: true });
    else host.querySelector<HTMLButtonElement>(`.crayon-library-tabs [data-view=${view}]`)?.focus({ preventScroll: true });
  };
  const open = () => openView('search');
  const removeFrame = () => { clearTimeout(frameTimer); frame?.remove(); frame = undefined; delete root.dataset.crayonLibraryExternal; };
  const request = async (url: string, controller: AbortController, body?: unknown) => {
    const token = options.auth?.accessToken();
    const response = await fetch(url, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.status === 401) { options.auth?.onUnauthorized(); throw new Error('登录已过期，请重新输入访问密码。'); }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      const code = data?.error?.code;
      throw new Error(code === 'RESOLVE_FAILED' ? '该线路未能解析这个播放页，请切换线路重试。' : code === 'UPSTREAM_TIMEOUT' ? '解析超时，请重试或切换线路。' : code === 'INVALID_REQUEST' ? '输入内容无效，请检查影片名称或具体播放页地址。' : body ? '解析服务暂时不可用，请重试或切换线路。' : '正版平台暂时无法查询，请稍后重试。');
    }
    return data;
  };
  const play = async (value: string, parser: ParserId = selected, title = sourceTitle) => {
    const validated = playbackSource(value, parser);
    const version = ++playVersion;
    searchVersion++; searchRequest?.abort(); searchRequest = undefined;
    loadRequest?.abort(); removeFrame(); playback.suspend();
    source = validated; sourceTitle = title; selected = parser; syncRoute(); share.hidden = true;
    if (collection && !collection.detail.episodes.some(episode => officialPage(episode.url)?.url === officialPage(source)?.url)) collection = undefined;
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
  function renderHistory(focusIndex?: number) {
    results.replaceChildren();
    const heading = document.createElement('div'); heading.className = 'crayon-library-history-heading';
    const title = document.createElement('strong'); title.textContent = '搜索历史';
    const note = document.createElement('small'); note.textContent = '仅保存在此浏览器';
    heading.append(title, note); results.append(heading);
    const list = document.createElement('div'); list.className = 'crayon-library-history-list';
    for (const [index, term] of history.entries()) {
      const row = document.createElement('div'); row.className = 'crayon-library-history-item';
      const use = button(term, () => { query.value = term; void search().catch(error => message(error.message)); });
      use.className = 'crayon-library-history-term'; use.title = term; use.setAttribute('aria-label', '搜索：' + term);
      const remove = button('', () => {
        history = writeSearchHistory(history.filter(value => value !== term));
        renderHistory(index);
      });
      remove.className = 'crayon-library-history-delete'; remove.title = '删除这条记录'; remove.setAttribute('aria-label', '删除搜索记录：' + term);
      remove.innerHTML = '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg>';
      row.append(use, remove); list.append(row);
    }
    if (history.length) results.append(list);
    else {
      const empty = document.createElement('p'); empty.className = 'crayon-library-history-empty';
      empty.textContent = '暂无搜索记录。搜索过的片名会显示在这里，点击即可再次搜索。'; results.append(empty);
    }
    if (focusIndex !== undefined) {
      const choices = list.querySelectorAll<HTMLButtonElement>('.crayon-library-history-delete');
      (choices[Math.min(focusIndex, choices.length - 1)] || query).focus();
    }
  }
  function showHistory() {
    searchVersion++; searchRequest?.abort(); searchRequest = undefined;
    showingHistory = true; share.hidden = true; message(''); renderHistory(); animateContent(results);
  }
  function renderCollection(current: Collection, target: HTMLElement, back = false) {
    target.replaceChildren();
    if (back) target.append(button('← 返回搜索结果', () => { void search(); }));
    const heading = document.createElement('strong'); heading.className = 'crayon-library-collection-title'; heading.textContent = current.item.title;
    const platforms = document.createElement('div'); platforms.className = 'crayon-library-platforms';
    for (const id of current.item.platforms) {
      const tab = button(platformName(id), () => {
        if (current.item.id === 'provided') renderCollection({ ...current, platform: id }, target, back);
        else void details(current.item, id, target, back);
      });
      tab.setAttribute('aria-pressed', String(id === current.platform)); platforms.append(tab);
    }
    const episodes = document.createElement('div'); episodes.className = 'crayon-library-episodes';
    for (const episode of current.detail.episodes) {
      const link = officialPage(episode.url);
      if (!link || link.platform !== current.platform) continue;
      const episodeLabel = /第\s*[\d一二三四五六七八九十百零]+\s*[集话期]/.exec(episode.title)?.[0] || episode.title;
      const choice = button(episodeLabel, () => {
        collection = current;
        void play(link.url, selected === 'native' ? 'ql' : selected, current.item.title + ' · ' + episode.title).catch(error => message(error.message));
      });
      choice.title = episode.title; choice.setAttribute('aria-label', episode.title);
      choice.setAttribute('aria-current', String(officialPage(source)?.url === link.url));
      episodes.append(choice);
    }
    const meta = document.createElement('div'); meta.className = 'crayon-library-collection-meta';
    meta.append(heading, platforms); target.append(meta, episodes);
    message((episodes.childElementCount ? `${platformName(current.platform)} · ${episodes.childElementCount} 个可选播放页` : '这个平台暂未提供可用分集，请选择其他平台。') + (current.detail.warning ? ' · ' + current.detail.warning : ''));
    animateContent(target);
  }
  function renderEpisodes() {
    if (!collection && options.episodes?.length) {
      const episodes = options.episodes.flatMap(episode => {
        const link = officialPage(episode.url);
        return link && link.platform === episode.platform ? [{ ...episode, url: link.url }] : [];
      });
      const platforms = [...new Set(episodes.map(episode => episode.platform))];
      const sourcePlatform = officialPage(source)?.platform;
      if (episodes.length) collection = {
        item: { id: 'provided', title: sourceTitle || art.title || '当前影片', year: '', description: '', platforms, links: episodes.map(episode => ({ platform: episode.platform, url: episode.url })) },
        platform: sourcePlatform && platforms.includes(sourcePlatform) ? sourcePlatform : platforms[0],
        detail: { title: sourceTitle || art.title || '当前影片', episodes, platforms, total: episodes.length },
      };
    }
    if (collection) { renderCollection(collection, episodeView); return; }
    episodeView.replaceChildren();
    const empty = document.createElement('div'); empty.className = 'crayon-library-empty';
    const title = document.createElement('strong'); title.textContent = '还没有这部影片的分集信息';
    const explanation = document.createElement('p'); explanation.textContent = '搜索影片并选择平台播放后，分集会保留在这里，随时打开即可继续选集。单条视频直链可能没有分集。';
    empty.append(title, explanation, button('搜索影片', () => openView('search')));
    episodeView.append(empty); message('');
  }
  function renderRoutes() {
    routeView.replaceChildren();
    for (const item of parserRoutes) {
      const choice = button('', () => {
        if (source) void play(source, item.id).catch(error => message(error.message));
        else { selected = item.id; syncRoute(); renderRoutes(); message(item.note); }
      });
      choice.className = 'crayon-library-route-choice'; choice.setAttribute('aria-pressed', String(item.id === selected));
      const title = document.createElement('strong'); title.textContent = item.name;
      const note = document.createElement('small'); note.textContent = item.note;
      choice.append(title, note); routeView.append(choice);
    }
    message(''); animateContent(routeView);
  }
  const details = async (item: VideoItem, chosen = item.links[0]?.platform || '', target: HTMLElement = results, back = true) => {
    if (!detailEndpoint || !chosen) return;
    searchRequest?.abort(); const controller = new AbortController(); searchRequest = controller;
    const version = ++searchVersion, timer = setTimeout(() => controller.abort(), 25000);
    target.replaceChildren(); message('正在读取分集…');
    try {
      const url = new URL(detailEndpoint, location.href); url.search = new URLSearchParams({ id: item.id, platform: chosen }).toString();
      const data = await request(url.href, controller) as VideoDetailResult;
      if (disposed || version !== searchVersion) return;
      renderCollection({ item, platform: chosen, detail: data }, target, back);
    } catch (error) { if (!disposed && version === searchVersion) message(controller.signal.aborted ? '分集读取超时，请重试。' : (error as Error).message); }
    finally { clearTimeout(timer); }
  };
  const search = async () => {
    const term = query.value.trim();
    if (/^https?:\/\//i.test(term)) { await play(term, selected === 'native' && officialPage(term) ? 'ql' : selected); return; }
    if (!term || term.length > 80) { message('请输入 1–80 字的影片名称。'); return; }
    if (!searchEndpoint) { message('当前站点未启用搜索。可粘贴播放页，或选择 M1907 按名称播放。'); return; }
    if (mobile.active()) query.blur();
    history = writeSearchHistory([term, ...history]); showingHistory = false;
    searchRequest?.abort(); const controller = new AbortController(); searchRequest = controller;
    const version = ++searchVersion, timer = setTimeout(() => controller.abort(), 30000);
    results.replaceChildren(); share.hidden = true; message('正在搜索五平台播放页…');
    try {
      const url = new URL(searchEndpoint, location.href); url.search = new URLSearchParams({ q: term, platform: platform.value, source: 'official' }).toString();
      const data = await request(url.href, controller) as VideoSearchResult;
      if (disposed || version !== searchVersion) return;
      for (const item of data.items) {
        const row = button('', () => { void details(item); }); row.className = 'crayon-library-result';
        const title = document.createElement('strong'); title.textContent = item.title;
        const meta = document.createElement('span'); meta.textContent = [item.year, item.type, item.episodeCount ? `${item.episodeCount} 集/期` : '', item.platforms.map(platformName).join(' / ')].filter(Boolean).join(' · ');
        const description = document.createElement('span'); description.className = 'description'; description.textContent = item.description;
        row.append(title, meta, description); results.append(row);
      }
      for (const provider of data.providers || []) {
        if (provider.status === 'ok') continue;
        // Derive navigation from the local platform list and query, never trust
        // a returned URL as an arbitrary external navigation target.
        const urls: Record<string, string> = { iqiyi: 'https://so.iqiyi.com/so/q_' + encodeURIComponent(term), qq: 'https://v.qq.com/x/search/?q=' + encodeURIComponent(term), youku: 'https://so.youku.com/search_video/q_' + encodeURIComponent(term), mgtv: 'https://so.mgtv.com/so?k=' + encodeURIComponent(term), bilibili: 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(term) };
        if (!urls[provider.platform]) continue;
        const link = document.createElement('a'); link.href = urls[provider.platform]; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = `到${platformName(provider.platform)}官网搜索 ↗`; link.className = 'crayon-library-result'; results.append(link);
      }
      animateContent(results);
      message(`${data.source} · ${data.items.length} 条结果${data.warning ? ' · ' + data.warning : ''}${data.items.length || data.warning ? '' : '；可调整片名或选择其他平台。'}`);
    } catch (error) { if (!disposed && version === searchVersion) message(controller.signal.aborted ? '搜索超时，请重试或选择单个平台。' : (error as Error).message); }
    finally { clearTimeout(timer); }
  };
  const onClick = (event: Event) => {
    const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    const action = trigger?.dataset.action;
    const view = (event.target as HTMLElement).closest<HTMLElement>('button[data-view]')?.dataset.view;
    if (view === 'search' || view === 'episodes' || view === 'routes') openView(view);
    if (action === 'menu') menu.show();
    if (action === 'search' || action === 'episodes' || action === 'routes') openView(action, trigger || undefined);
    if (action === 'close') close();
    if (action === 'history') showHistory();
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
      const items = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([hidden]),select,a[href]')).filter(item => !item.closest('[hidden]'));
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
  const resize = () => { host.dataset.compact = String(root.getBoundingClientRect().height < 340); };
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
  observer?.observe(root); window.addEventListener('resize', resize); resize();
  const destroy = () => { if (disposed) return; disposed = true; panelVersion++; cancelPanelMotion(panel); mobile.destroy(); playVersion++; searchVersion++; menu.destroy(); loadRequest?.abort(); searchRequest?.abort(); observer?.disconnect(); window.removeEventListener('resize', resize); removeFrame(); host.remove(); };
  art.on('destroy', destroy); syncRoute();
  if (source && (selected !== 'native' || source !== playback.initialUrl)) void play(source, selected).catch(error => message(error.message, true));
  return { open, openEpisodes: () => openView('episodes'), play, source: () => source, parser: () => selected, destroy };
}
