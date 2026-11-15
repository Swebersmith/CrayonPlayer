import { createCrayonPlayer } from './src/index';
import type { PlaybackSource } from './src/index';
import { mediaAddress, pageSource, playbackEntry } from './demo-entry';

declare const __CRAYON_PREPARE_ENDPOINT__: string;
const entry = playbackEntry(window.location.href, window.self !== window.top);
const status = document.querySelector<HTMLDivElement>('#status')!;
const form = document.querySelector<HTMLFormElement>('#source-form')!;
const input = document.querySelector<HTMLInputElement>('#source-url')!;
const results = document.querySelector<HTMLElement>('#catalog-results')!;
interface CatalogItem { id: string; title: string; year: string; sourceName: string; remarks: string }
interface CatalogDetail { title: string; lines: { id: string; name: string; episodes: { id: string; title: string; url: string }[] }[] }
let player: ReturnType<typeof createCrayonPlayer> | undefined;
let pending: AbortController | undefined;
let generation = 0;
const destroyPlayer = () => { player?.destroy(); player = undefined; };
const showError = (message: string) => { document.body.dataset.entryError = 'true'; status.textContent = message; };
function loadMedia(url: string, original = url, type = '', direct = original === url, sources?: PlaybackSource[]) {
  destroyPlayer();
  player = createCrayonPlayer({
    container: '#player', url, title: '映屿 YINGYU', autoplay: false,
    storageKey: `crayon-player-demo:${original}`,
    // Resolved URLs already use signed same-origin media forwarding. Do not
    // prepare them again or send HTML pages to Crayon's HLS/MP4 loaders.
    prepareMedia: direct ? __CRAYON_PREPARE_ENDPOINT__ || undefined : undefined,
    ...(sources?.length ? { sources, onSourceChange: (source: PlaybackSource) => { status.textContent = '当前线路 ' + source.name; } } : {}),
    ...(type ? { player: { type } } : {}),
  });
  input.value = original;
  document.body.dataset.entryError = 'false';
  status.textContent = original === url
    ? '支持 MP4、M3U8 直链及腾讯、优酷、爱奇艺、芒果TV、B站视频页面。'
    : '解析成功，已交给 Crayon 播放。点击画面中的播放按钮开始观看。';
}
async function resolvePage(source: string, version: number) {
  destroyPlayer();
  input.value = source;
  if (!__CRAYON_PREPARE_ENDPOINT__) { showError('网页链接解析需要配套服务，请使用 Cloudflare 完整部署，或输入 MP4 / M3U8 直链。'); return; }
  const controller = new AbortController(); pending = controller;
  const timer = setTimeout(() => controller.abort(), 120000);
  // The embedded /parse entry hides page chrome; show progress in its status area.
  showError('正在解析视频页面并比较片源清晰度与连接速度…');
  try {
    const response = await fetch('/api/player/resolve', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: source }),
    });
    const data = await response.json().catch(() => null);
    if (version !== generation || controller.signal.aborted) return;
    if (!response.ok || !data?.url) throw new Error(data?.error?.message || '解析服务暂时不可用，请稍后重试。');
    const media = mediaAddress(data.url);
    loadMedia(media, source, data.type === 'm3u8' ? 'm3u8' : data.type === 'webm' ? 'webm' : 'mp4', data.direct === true, Array.isArray(data.routes) ? data.routes : undefined);
    if (data.match) status.textContent = `已匹配 ${data.match.title} · ${data.match.episodeTitle} · ${data.match.sourceName}，点击播放开始观看。`;
  } catch (error) {
    if (version !== generation) return;
    showError(controller.signal.aborted ? '解析超时，请稍后重试。' : (error as Error).message);
  } finally { clearTimeout(timer); if (pending === controller) pending = undefined; }
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
async function showDetail(id: string, version: number) {
  try {
    status.textContent = '正在读取播放线路与分集…';
    const data = await catalogRequest('/api/player/detail?' + new URLSearchParams({ id }), version) as CatalogDetail | undefined;
    if (!data) return;
    results.replaceChildren(); results.hidden = false;
    const heading = document.createElement('h2'); heading.textContent = data.title; results.append(heading);
    for (const line of data.lines) {
      const label = document.createElement('h3'); label.textContent = line.name; results.append(label);
      const episodes = document.createElement('div'); episodes.className = 'catalog-grid';
      for (const episode of line.episodes) episodes.append(choice(episode.title, () => {
        start(episode.url);
      }));
      results.append(episodes);
    }
    status.textContent = data.lines.length ? '选择分集开始播放。' : '该影片暂无可用播放线路。';
  } catch (error) { if (version === generation) showError((error as Error).message); }
}
async function searchTitle(value: string) {
  const version = ++generation;
  results.replaceChildren(); results.hidden = true;
  document.body.dataset.entryError = 'false';
  status.textContent = '正在搜索采集源…';
  try {
    const data = await catalogRequest('/api/resolve?' + new URLSearchParams({ input: value }), version);
    if (!data) return;
    results.hidden = false;
    for (const item of data.items as CatalogItem[]) results.append(choice(
      [item.title, item.year, item.sourceName, item.remarks].filter(Boolean).join(' · '),
      () => { void showDetail(item.id, ++generation); },
    ));
    status.textContent = `找到 ${data.items.length} 条结果。${data.warning || ''}`;
  } catch (error) { if (version === generation) showError((error as Error).message); }
}
function start(url: string) {
  const version = ++generation;
  pending?.abort(); pending = undefined;
  try {
    const source = pageSource(url);
    if (source) { void resolvePage(source, version); return; }
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
else start(entry.url);
window.addEventListener('pagehide', () => { generation++; pending?.abort(); destroyPlayer(); });
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
