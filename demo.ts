import { createCrayonPlayer } from './src/index';
import { mediaAddress, pageSource, playbackEntry } from './demo-entry';

declare const __CRAYON_PREPARE_ENDPOINT__: string;
const entry = playbackEntry(window.location.href, window.self !== window.top);
const status = document.querySelector<HTMLDivElement>('#status')!;
const form = document.querySelector<HTMLFormElement>('#source-form')!;
const input = document.querySelector<HTMLInputElement>('#source-url')!;
let player: ReturnType<typeof createCrayonPlayer> | undefined;
let pending: AbortController | undefined;
let generation = 0;
const destroyPlayer = () => { player?.destroy(); player = undefined; };
const showError = (message: string) => { document.body.dataset.entryError = 'true'; status.textContent = message; };
function loadMedia(url: string, original = url, type = '') {
  destroyPlayer();
  player = createCrayonPlayer({
    container: '#player', url, title: '映屿 YINGYU', autoplay: false,
    storageKey: `crayon-player-demo:${original}`,
    // Resolved URLs already use signed same-origin media forwarding. Do not
    // prepare them again or send HTML pages to Crayon's HLS/MP4 loaders.
    prepareMedia: original === url ? __CRAYON_PREPARE_ENDPOINT__ || undefined : undefined,
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
  const timer = setTimeout(() => controller.abort(), 75000);
  // The embedded /parse entry hides page chrome; show progress in its status area.
  showError('正在解析视频页面，请稍候…');
  try {
    const response = await fetch('/api/player/resolve', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parser: 'ql', url: source }),
    });
    const data = await response.json().catch(() => null);
    if (version !== generation || controller.signal.aborted) return;
    if (!response.ok || !data?.url) throw new Error(data?.error?.message || '解析服务暂时不可用，请稍后重试。');
    const media = mediaAddress(data.url);
    loadMedia(media, source, data.type === 'm3u8' ? 'm3u8' : 'mp4');
  } catch (error) {
    if (version !== generation) return;
    showError(controller.signal.aborted ? '解析超时，请稍后重试。' : (error as Error).message);
  } finally { clearTimeout(timer); if (pending === controller) pending = undefined; }
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
  try { start(mediaAddress(input.value.trim())); }
  catch (error) { showError((error as Error).message); }
});
if (entry.error) showError(entry.error);
else start(entry.url);
window.addEventListener('pagehide', () => { generation++; pending?.abort(); destroyPlayer(); });
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
