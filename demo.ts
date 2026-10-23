import { createLunaPlayer } from './src/index';

const input = document.querySelector<HTMLInputElement>('#source')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
input.value = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
let player: ReturnType<typeof createLunaPlayer> | undefined;
function load() {
  const url = new URL(input.value);
  if (!/^https?:$/.test(url.protocol)) { status.textContent = '请使用 HTTP(S) 视频地址。'; return; }
  player?.destroy();
  player = createLunaPlayer({
    container: '#player', url: url.href, title: 'Luna Player', autoplay: false,
    storageKey: `luna-player-demo:${url.href}`,
  });
  status.textContent = '视频已载入；点击播放开始观看。';
}
document.querySelector('#source-form')!.addEventListener('submit', event => {
  event.preventDefault();
  try { load(); } catch { status.textContent = '载入失败，请检查视频地址。'; }
});
load();
window.addEventListener('pagehide', () => player?.destroy());
