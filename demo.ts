import { createCrayonPlayer } from './src/index';

declare const __CRAYON_PREPARE_ENDPOINT__: string;

const input = document.querySelector<HTMLInputElement>('#source')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
input.value = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
let player: ReturnType<typeof createCrayonPlayer> | undefined;
function load() {
  const url = new URL(input.value);
  if (!/^https?:$/.test(url.protocol)) { status.textContent = '请使用 HTTP(S) 视频地址。'; return; }
  player?.destroy();
  player = createCrayonPlayer({
    container: '#player', url: url.href, title: 'Crayon Player', autoplay: false,
    storageKey: `crayon-player-demo:${url.href}`,
    prepareMedia: __CRAYON_PREPARE_ENDPOINT__ || undefined,
  });
  status.textContent = __CRAYON_PREPARE_ENDPOINT__
    ? 'Crayon 已载入视频，点击播放开始观看；本地和投屏均已接入去广告服务。'
    : 'Crayon 已载入视频，点击播放。当前为静态模式，投屏去广告需要配套清单服务。';
}
document.querySelector('#source-form')!.addEventListener('submit', event => {
  event.preventDefault();
  try { load(); } catch { status.textContent = '载入失败，请检查视频地址。'; }
});
load();
window.addEventListener('pagehide', () => player?.destroy());
