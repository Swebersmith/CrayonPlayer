import { createCrayonPlayer, createMediaPreparer } from './src/index';
import { playbackEntry, playbackLink } from './demo-entry';
import { setupIntegrationGuide } from './demo-integration';
import { setupEmbeddedLogin } from './demo-auth';
import { initialParser } from './demo-parsers';

declare const __CRAYON_PREPARE_ENDPOINT__: string;
const entry = playbackEntry(window.location.href);
const status = document.querySelector<HTMLDivElement>('#status')!;
const signOut = document.querySelector<HTMLFormElement>('#sign-out');
document.body.dataset.embedded = String(entry.embedded);
if (signOut) signOut.hidden = !__CRAYON_PREPARE_ENDPOINT__ || entry.embedded;
let player: ReturnType<typeof createCrayonPlayer> | undefined;
let embeddedLogin: ReturnType<typeof setupEmbeddedLogin> | undefined;
setupIntegrationGuide(window.location.href, !!__CRAYON_PREPARE_ENDPOINT__,
  () => player?.library?.source() || entry.url,
  () => player?.library?.parser() || new URL(location.href).searchParams.get('parser') || 'native');
const destroyPlayer = () => { player?.destroy(); player = undefined; };
const showError = (message: string) => { document.body.dataset.entryError = 'true'; status.textContent = message; };
function start() {
  document.querySelector<HTMLElement>('#player-page')!.hidden = false;
  try {
    const parser = initialParser(window.location.href, entry.url);
    player = createCrayonPlayer({
      container: '#player', url: parser === 'native' ? entry.url : '', title: 'Crayon Player', autoplay: false,
      storageKey: `crayon-player-demo:${entry.url}`,
      prepareMedia: embeddedLogin ? createMediaPreparer(__CRAYON_PREPARE_ENDPOINT__, embeddedLogin) : __CRAYON_PREPARE_ENDPOINT__ || undefined,
      library: {
        source: entry.url, parser, auth: embeddedLogin,
        searchEndpoint: __CRAYON_PREPARE_ENDPOINT__ ? '/api/player/search' : false,
        detailEndpoint: __CRAYON_PREPARE_ENDPOINT__ ? '/api/player/detail' : false,
        resolveEndpoint: __CRAYON_PREPARE_ENDPOINT__ ? '/api/player/resolve' : false,
        shareLink: (source, route) => playbackLink(window.location.href, source, !!__CRAYON_PREPARE_ENDPOINT__, route),
        onSourceChange: () => { document.body.dataset.entryError = 'false'; },
      },
      ...(embeddedLogin ? { player: { settings: [{ name: 'viewerLogout', html: '退出登录', onClick() { void embeddedLogin!.logout(); return '退出登录'; } }] } } : {}),
    });
    document.body.dataset.entryError = 'false';
    status.textContent = '轻触画面或移动鼠标可唤出上方居中的菜单，2.5 秒无操作后自动隐藏。点击「选集」在画面内展开分集；也可轻触顶部边缘或按 M 打开菜单，全屏和嵌入模式同样可用。';
    if (embeddedLogin?.storageBlocked()) player.notice.show = '浏览器禁止保存登录状态，刷新后可能需要重新输入密码';
  } catch (error) { showError((error as Error).message); }
}
if (entry.error) {
  document.querySelector<HTMLElement>('#player-page')!.hidden = false;
  showError(entry.error);
} else if (__CRAYON_PREPARE_ENDPOINT__ && (entry.embedded || window.self !== window.top)) {
  embeddedLogin = setupEmbeddedLogin(start, destroyPlayer);
  signOut?.addEventListener('submit', event => { event.preventDefault(); void embeddedLogin!.logout(); });
} else start();
window.addEventListener('pagehide', () => { embeddedLogin?.dispose(); destroyPlayer(); });
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
