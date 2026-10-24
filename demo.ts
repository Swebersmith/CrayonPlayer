import { createCrayonPlayer, createMediaPreparer } from './src/index';
import { mediaAddress, playbackEntry, playbackLink } from './demo-entry';
import { setupIntegrationGuide } from './demo-integration';
import { setupEmbeddedLogin } from './demo-auth';

declare const __CRAYON_PREPARE_ENDPOINT__: string;

const input = document.querySelector<HTMLInputElement>('#source')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
const link = document.querySelector<HTMLInputElement>('#playback-link')!;
const entry = playbackEntry(window.location.href);
document.body.dataset.embedded = String(entry.embedded);
const signOut = document.querySelector<HTMLFormElement>('#sign-out');
if (signOut) signOut.hidden = !__CRAYON_PREPARE_ENDPOINT__ || entry.embedded;
input.value = entry.url;
setupIntegrationGuide(window.location.href, !!__CRAYON_PREPARE_ENDPOINT__, () => input.value);
let player: ReturnType<typeof createCrayonPlayer> | undefined;
let embeddedLogin: ReturnType<typeof setupEmbeddedLogin> | undefined;
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
    prepareMedia: embeddedLogin ? createMediaPreparer(__CRAYON_PREPARE_ENDPOINT__, embeddedLogin) : __CRAYON_PREPARE_ENDPOINT__ || undefined,
    ...(embeddedLogin ? { player: { settings: [{ name: 'viewerLogout', html: '退出登录', onClick() { void embeddedLogin!.logout(); return '退出登录'; } }] } } : {}),
  });
  document.body.dataset.entryError = 'false';
  link.hidden = true;
  status.textContent = __CRAYON_PREPARE_ENDPOINT__
    ? 'Crayon 已载入视频，点击播放；设置中可分别切换服务器中转和去广告，两项开启时投屏也使用去广告清单。'
    : 'Crayon 已载入视频，点击播放。当前为静态模式，投屏去广告需要配套清单服务。';
}
document.querySelector('#source-form')!.addEventListener('submit', event => {
  event.preventDefault();
  if (embeddedLogin && !embeddedLogin.isReady()) return;
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
const start = () => {
  document.querySelector<HTMLElement>('#player-page')!.hidden = false;
  try { load(); } catch (error) { showError((error as Error).message); }
  if (embeddedLogin?.storageBlocked() && player) player.notice.show = '浏览器禁止保存登录状态，刷新或换集后可能需要重新输入密码';
};
if (entry.error) {
  document.querySelector<HTMLElement>('#player-page')!.hidden = false;
  showError(entry.error);
} else if (__CRAYON_PREPARE_ENDPOINT__ && (entry.embedded || window.self !== window.top)) {
  embeddedLogin = setupEmbeddedLogin(start, () => { player?.destroy(); player = undefined; });
  signOut?.addEventListener('submit', event => { event.preventDefault(); void embeddedLogin!.logout(); });
} else {
  start();
}
window.addEventListener('pagehide', () => { embeddedLogin?.dispose(); player?.destroy(); });
// A restored history entry must recreate the disposed player, reusing the saved
// session rather than leaving a dead video surface in the browser's back cache.
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
