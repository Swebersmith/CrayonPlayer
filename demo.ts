import { createCrayonPlayer } from './src/index';
import type { EpisodePlayback, PlaybackEpisode, PlaybackSource } from './src/index';
import { mediaAddress, pageSource, playbackEntry } from './demo-entry';
import { attachSiteTheme } from './demo-theme';
import { catalogCard, catalogPoster, groupCatalogItems, CatalogGroup, CatalogItem } from './demo-catalog';

declare const __CRAYON_PREPARE_ENDPOINT__: string;
const entry = playbackEntry(window.location.href, window.self !== window.top);
const status = document.querySelector<HTMLDivElement>('#status')!;
const form = document.querySelector<HTMLFormElement>('#source-form')!;
const input = document.querySelector<HTMLInputElement>('#source-url')!;
const resolverProvider = document.querySelector<HTMLSelectElement>('#resolver-provider')!;
const requestedParser = new URL(window.location.href).searchParams.get('parser');
if (requestedParser && ['auto', 'cms', 'ql'].includes(requestedParser)) resolverProvider.value = requestedParser;
const results = document.querySelector<HTMLElement>('#catalog-results')!;
interface CatalogDetail extends CatalogItem { lines: { id: string; name: string; episodes: { id: string; title: string; url: string; number?: number }[] }[] }
type EpisodeReference = NonNullable<PlaybackEpisode['episodeRef']>;
type EpisodeRequest = { url: string; parser?: string } | { id: string } | { episodeRef: EpisodeReference };
interface ResolvedPlayback {
  url: string; type?: string; direct?: boolean; routes?: PlaybackSource[]; episodes?: PlaybackEpisode[]; selectedEpisodeNumber?: number; selectedEpisodeKey?: string;
  match?: { title: string; episodeTitle: string; sourceName: string };
}
interface EpisodeContext { request: EpisodeRequest; original: string; data: ResolvedPlayback }
let player: ReturnType<typeof createCrayonPlayer> | undefined;
let pending: AbortController | undefined;
let generation = 0;
let searchGroups: CatalogGroup[] = [];
let searchSummary = '';
const disposeTheme = attachSiteTheme();
const destroyPlayer = () => { player?.destroy(); player = undefined; };
const showError = (message: string) => { document.body.dataset.entryError = 'true'; status.textContent = message; };
function loadMedia(url: string, original = url, type = '', direct = original === url, sources?: PlaybackSource[], context?: EpisodeContext) {
  destroyPlayer();
  player = createCrayonPlayer({
    container: '#player', url, title: context?.data.match?.title || 'crayonplayer', autoplay: false,
    storageKey: `crayon-player-demo:${original}:${context?.data.selectedEpisodeKey ?? context?.data.selectedEpisodeNumber ?? ''}`,
    // Resolved URLs already use signed same-origin media forwarding. Do not
    // prepare them again or send HTML pages to Crayon's HLS/MP4 loaders.
    prepareMedia: direct ? __CRAYON_PREPARE_ENDPOINT__ || undefined : undefined,
    ...(sources?.length ? { sources, onSourceChange: (source: PlaybackSource) => { status.textContent = '当前线路 ' + source.name; } } : {}),
    ...(context?.data.episodes?.length ? {
      episodes: context.data.episodes, episodeNumber: context.data.selectedEpisodeNumber, episodeKey: context.data.selectedEpisodeKey,
      onEpisodeChange: (episode: PlaybackEpisode) => changeEpisode(context, episode),
    } : {}),
    ...(type ? { player: { type } } : {}),
  });
  input.value = original;
  document.body.dataset.entryError = 'false';
  status.textContent = original === url
    ? '播放器已就绪。'
    : '解析成功，点击播放开始观看。';
}
async function requestPlayback(payload: EpisodeRequest & { episode?: number; episodeNumber?: number }, version: number) {
  pending?.abort();
  const controller = new AbortController(); pending = controller;
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch('/api/player/resolve', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (version !== generation) return;
    if (!response.ok || !data?.url) throw new Error(data?.error?.message || '解析服务暂时不可用，请稍后重试。');
    mediaAddress(data.url);
    return data as ResolvedPlayback;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('解析已取消或超时，请重试。');
    throw error;
  } finally { clearTimeout(timer); if (pending === controller) pending = undefined; }
}
function loadResolved(data: ResolvedPlayback, original: string, request: EpisodeRequest) {
  const media = mediaAddress(data.url);
  loadMedia(media, original, data.type || '', data.direct === true, data.routes, { request, original, data });
  results.hidden = true;
  if (data.match) status.textContent = `已匹配 ${data.match.title} · ${data.match.episodeTitle} · ${data.match.sourceName}，点击播放开始观看。`;
}
async function changeEpisode(context: EpisodeContext, episode: PlaybackEpisode): Promise<EpisodePlayback> {
  const version = ++generation;
  status.textContent = '正在解析' + episode.title + '并比较可用线路…';
  try {
    const payload = episode.episodeRef ? { episodeRef: episode.episodeRef }
      : 'id' in context.request ? { ...context.request, episodeNumber: episode.number }
      : 'episodeRef' in context.request ? { id: context.request.episodeRef.id, episodeNumber: episode.number }
      : { ...context.request, episode: episode.number };
    const data = await requestPlayback(payload, version);
    if (!data) throw new Error('选集请求已取消');
    status.textContent = data.match ? `当前播放 ${data.match.title} · ${data.match.episodeTitle} · ${data.match.sourceName}` : episode.title;
    return { url: data.url, type: data.type, title: data.match?.title, sources: data.routes, episodes: data.episodes,
      episodeNumber: data.selectedEpisodeNumber ?? episode.number, episodeKey: data.selectedEpisodeKey ?? episode.key,
      storageKey: `crayon-player-demo:${context.original}:${data.selectedEpisodeKey ?? episode.key ?? episode.number}` };
  } catch (error) { if (version === generation) status.textContent = (error as Error).message; throw error; }
}
async function resolvePage(source: string, version: number) {
  destroyPlayer();
  input.value = source;
  if (!__CRAYON_PREPARE_ENDPOINT__) { showError('网页链接解析需要配套服务，请使用 Cloudflare 完整部署，或输入 MP4 / M3U8 直链。'); return; }
  // The embedded /parse entry hides page chrome; show progress in its status area.
  showError('正在解析视频页面并比较片源清晰度与连接速度…');
  try {
    const request = { url: source, parser: resolverProvider.value };
    const data = await requestPlayback(request, version);
    if (data) loadResolved(data, source, request);
  } catch (error) {
    if (version !== generation) return;
    showError((error as Error).message);
  }
}
async function playCatalogEpisode(episodeRef: EpisodeReference, title: string) {
  const version = ++generation;
  status.textContent = '正在解析' + episodeRef.title + '并比较可用线路…';
  try {
    const request = { episodeRef };
    const data = await requestPlayback(request, version);
    if (data) loadResolved(data, title, request);
  } catch (error) { if (version === generation) showError((error as Error).message); }
}
function choice(label: string, action: () => void) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'catalog-choice'; button.textContent = label;
  button.addEventListener('click', action); return button;
}
async function catalogRequest(path: string, version: number) {
  pending?.abort();
  const controller = new AbortController(); pending = controller;
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(path, { signal: controller.signal, cache: 'no-store' });
    const data = await response.json();
    if (version !== generation) return;
    if (!response.ok) throw new Error(data?.error?.message || '采集服务暂时不可用');
    return data;
  } finally { clearTimeout(timer); if (pending === controller) pending = undefined; }
}
function renderSearchResults() {
  results.replaceChildren(); results.hidden = false;
  status.textContent = searchSummary;
  const heading = document.createElement('div'); heading.className = 'catalog-heading';
  const title = document.createElement('h2'); title.textContent = '搜索结果';
  const count = document.createElement('span'); count.textContent = searchSummary;
  heading.append(title, count); results.append(heading);
  if (!searchGroups.length) {
    const empty = document.createElement('p'); empty.className = 'catalog-empty'; empty.textContent = '没有找到相关影片，试试其他片名。'; results.append(empty);
    return;
  }
  const grid = document.createElement('div'); grid.className = 'catalog-cards';
  searchGroups.forEach((group, index) => grid.append(catalogCard(group, index, () => { void showDetail(group.items[0].id, ++generation, group); })));
  results.append(grid);
}
function renderDetail(data: CatalogDetail, id: string, group: CatalogGroup) {
  results.replaceChildren(); results.hidden = false;
  const back = choice('← 返回搜索结果', () => { generation++; pending?.abort(); pending = undefined; renderSearchResults(); }); back.className = 'catalog-back'; results.append(back);
  const detail = document.createElement('div'); detail.className = 'catalog-detail';
  const summary = document.createElement('div'); summary.className = 'catalog-summary';
  const item = { ...group.item, ...data, poster: data.poster || group.item.poster };
  summary.append(catalogPoster(item));
  const copy = document.createElement('div'); copy.className = 'catalog-summary-copy';
  const heading = document.createElement('h2'); heading.textContent = data.title;
  const meta = document.createElement('p'); meta.className = 'catalog-summary-meta'; meta.textContent = [data.year || group.item.year, data.type, data.language, data.remarks].filter(Boolean).join(' · ');
  copy.append(heading, meta);
  if (data.description || group.item.description) {
    const description = document.createElement('p'); description.className = 'catalog-summary-description'; description.textContent = data.description || group.item.description || ''; copy.append(description);
  }
  summary.append(copy); detail.append(summary);
  if (group.items.length > 1) {
    const sources = document.createElement('div'); sources.className = 'catalog-sources'; sources.setAttribute('aria-label', '选择采集源');
    for (const source of group.items) {
      const button = choice([source.sourceName, source.remarks].filter(Boolean).join(' · '), () => { if (source.id !== id) void showDetail(source.id, ++generation, group); });
      button.className = 'catalog-source'; button.setAttribute('aria-pressed', String(source.id === id)); sources.append(button);
    }
    detail.append(sources);
  }
  const lines = document.createElement('div'); lines.className = 'catalog-lines';
  const episodes = document.createElement('div');
  const renderLine = (lineIndex: number, page = 0) => {
    const line = data.lines[lineIndex];
    episodes.replaceChildren();
    lines.querySelectorAll('button').forEach((button, index) => button.setAttribute('aria-pressed', String(index === lineIndex)));
    if (!line) return;
    const header = document.createElement('div'); header.className = 'catalog-episode-heading';
    const label = document.createElement('h3'); label.textContent = line.name; header.append(label);
    if (line.episodes.length > 100) {
      const controls = document.createElement('div'); controls.className = 'catalog-page-controls';
      const previous = choice('上一页', () => renderLine(lineIndex, page - 1)); previous.disabled = page === 0;
      const range = document.createElement('select'); range.setAttribute('aria-label', '集数范围');
      for (let offset = 0; offset < line.episodes.length; offset += 100) {
        const option = document.createElement('option'); option.value = String(offset / 100); option.textContent = (offset + 1) + '–' + Math.min(offset + 100, line.episodes.length); range.append(option);
      }
      range.value = String(page); range.addEventListener('change', () => renderLine(lineIndex, Number(range.value)));
      const next = choice('下一页', () => renderLine(lineIndex, page + 1)); next.disabled = (page + 1) * 100 >= line.episodes.length;
      controls.append(previous, range, next); header.append(controls);
    }
    const grid = document.createElement('div'); grid.className = 'catalog-grid';
    for (const episode of line.episodes.slice(page * 100, page * 100 + 100)) {
      const button = choice(episode.title, () => {
        void playCatalogEpisode({ id, line: line.id, lineName: line.name, episode: episode.id, title: episode.title }, data.title);
      });
      button.dataset.catalogEpisode = ''; grid.append(button);
    }
    episodes.append(header, grid);
  };
  if (data.lines.length > 1) data.lines.forEach((line, index) => {
    const button = choice(line.name, () => renderLine(index)); button.className = 'catalog-line'; lines.append(button);
  });
  detail.append(lines, episodes); results.append(detail); renderLine(0);
}
async function showDetail(id: string, version: number, group: CatalogGroup) {
  try {
    status.textContent = '正在读取播放线路与分集…';
    const data = await catalogRequest('/api/player/detail?' + new URLSearchParams({ id }), version) as CatalogDetail | undefined;
    if (!data) return;
    renderDetail(data, id, group);
    status.textContent = data.lines.length ? '选择分集开始播放。' : '该影片暂无可用播放线路。';
  } catch (error) { if (version === generation) showError((error as Error).message); }
}
async function searchTitle(value: string) {
  const version = ++generation;
  results.replaceChildren(); results.hidden = true;
  searchGroups = [];
  document.body.dataset.entryError = 'false';
  status.textContent = '正在搜索采集源…';
  try {
    const data = await catalogRequest('/api/resolve?' + new URLSearchParams({ input: value }), version);
    if (!data) return;
    searchGroups = groupCatalogItems(Array.isArray(data.items) ? data.items : []);
    const queryKey = value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
    const exactMatch = (group: CatalogGroup) => group.key.split('|')[0] === queryKey;
    searchGroups.sort((a, b) => Number(exactMatch(b)) - Number(exactMatch(a)));
    const providers = new Set(searchGroups.flatMap(group => group.items.map(item => item.sourceId || item.id.split(':')[0])));
    searchSummary = searchGroups.length + ' 部影片 · ' + providers.size + ' 个采集源';
    renderSearchResults();
    status.textContent = `找到 ${searchGroups.length} 部影片。${data.warning || ''}`;
    results.scrollIntoView?.({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  } catch (error) { if (version === generation) showError((error as Error).message); }
}
function start(url: string) {
  const version = ++generation;
  pending?.abort(); pending = undefined;
  try {
    const source = pageSource(url);
    if (source) {
      if (new URL(url).hostname === 'svip.qlplayer.cyou') resolverProvider.value = 'ql';
      void resolvePage(source, version); return;
    }
    loadMedia(url);
  } catch (error) { showError((error as Error).message); }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const value = input.value.trim();
  if (value && !/^[a-z][a-z\d+.-]*:/i.test(value)) { void searchTitle(value); return; }
  try { start(mediaAddress(input.value.trim())); }
  catch (error) { showError((error as Error).message); }
});
if (entry.error) showError(entry.error);
else {
  start(entry.url);
  if (!new URLSearchParams(window.location.search).has('url')) input.value = '';
}
window.addEventListener('pagehide', () => { generation++; pending?.abort(); destroyPlayer(); disposeTheme(); });
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
