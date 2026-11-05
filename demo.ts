import { createCrayonPlayer } from './src/index';
import { mediaAddress, playbackEntry } from './demo-entry';

declare const __CRAYON_PREPARE_ENDPOINT__: string;
const entry = playbackEntry(window.location.href, window.self !== window.top);
const status = document.querySelector<HTMLDivElement>('#status')!;
const form = document.querySelector<HTMLFormElement>('#source-form')!;
const input = document.querySelector<HTMLInputElement>('#source-url')!;
let player: ReturnType<typeof createCrayonPlayer> | undefined;
const destroyPlayer = () => { player?.destroy(); player = undefined; };
const showError = (message: string) => { document.body.dataset.entryError = 'true'; status.textContent = message; };
function start(url: string) {
  destroyPlayer();
  try {
    player = createCrayonPlayer({
      container: '#player', url, title: '映屿 YINGYU', autoplay: false,
      storageKey: `crayon-player-demo:${url}`,
      prepareMedia: __CRAYON_PREPARE_ENDPOINT__ || undefined,
    });
    input.value = url;
    document.body.dataset.entryError = 'false';
    status.textContent = '粘贴 MP4 或 M3U8 视频地址，点击载入视频即可播放。';
  } catch (error) { showError((error as Error).message); }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  try { start(mediaAddress(input.value.trim())); }
  catch (error) { showError((error as Error).message); }
});
if (entry.error) showError(entry.error);
else start(entry.url);
window.addEventListener('pagehide', destroyPlayer);
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
