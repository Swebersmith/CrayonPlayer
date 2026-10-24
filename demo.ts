import { createCrayonPlayer } from './src/index';
import { mediaAddress, playbackEntry, playbackLink } from './demo-entry';

declare const __CRAYON_PREPARE_ENDPOINT__: string;

const input = document.querySelector<HTMLInputElement>('#source')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
const link = document.querySelector<HTMLInputElement>('#playback-link')!;
const entry = playbackEntry(window.location.href);
document.body.dataset.embedded = String(entry.embedded);
input.value = entry.url;
let player: ReturnType<typeof createCrayonPlayer> | undefined;
function showError(message: string) {
  document.body.dataset.entryError = 'true';
  status.textContent = message;
}
function load() {
  const url = mediaAddress(input.value);
  player?.destroy();
  player = createCrayonPlayer({
    container: '#player', url, title: 'Crayon Player', autoplay: false,
    storageKey: `crayon-player-demo:${url}`,
    prepareMedia: __CRAYON_PREPARE_ENDPOINT__ || undefined,
  });
  document.body.dataset.entryError = 'false';
  link.hidden = true;
  status.textContent = __CRAYON_PREPARE_ENDPOINT__
    ? 'Crayon 已载入视频，点击播放开始观看；本地和投屏均已接入去广告服务。'
    : 'Crayon 已载入视频，点击播放。当前为静态模式，投屏去广告需要配套清单服务。';
}
document.querySelector('#source-form')!.addEventListener('submit', event => {
  event.preventDefault();
  try { load(); } catch (error) { showError((error as Error).message); }
});
document.querySelector('#share-source')!.addEventListener('click', () => {
  try {
    link.value = playbackLink(window.location.href, input.value, !!__CRAYON_PREPARE_ENDPOINT__);
    link.hidden = false;
    link.focus();
    link.select();
    status.textContent = '播放链接已生成，可复制下方地址使用；首次访问仍需登录播放器。';
  } catch (error) { showError((error as Error).message); }
});
if (entry.error) showError(entry.error);
else {
  try { load(); } catch (error) { showError((error as Error).message); }
}
window.addEventListener('pagehide', () => player?.destroy());
