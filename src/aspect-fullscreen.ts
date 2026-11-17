import type Artplayer from 'artplayer';
import type { Setting } from 'artplayer/types/setting';

const STORAGE_KEY = 'crayon-player-aspect-fullscreen';
export const ASPECT_FULLSCREEN_CHANGE = 'crayon-aspect-fullscreen-change';

type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null };

function preferred() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; }
  catch { return false; }
}

/** Fullscreen can fill the whole screen with the video's original aspect ratio. */
export function aspectFullscreenSetting(): Setting {
  const enabled = preferred();
  return {
    name: 'crayonAspectFullscreen', html: '等比例全屏', switch: enabled,
    tooltip: enabled ? '全屏时等比铺满，必要时裁掉画面边缘' : '全屏时保留完整画面',
    onSwitch(item) {
      const next = !item.switch;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* Storage is optional. */ }
      this.template.$player.dispatchEvent(new CustomEvent(ASPECT_FULLSCREEN_CHANGE, { detail: next }));
      item.tooltip = next ? '全屏时等比铺满，必要时裁掉画面边缘' : '全屏时保留完整画面';
      this.notice.show = next ? '等比例全屏已开启：全屏按原比例铺满' : '等比例全屏已关闭：全屏保留完整画面';
      return next;
    },
  };
}

const styles = `
.art-video-player[data-crayon-aspect-fullscreen=true] .art-video{object-fit:cover!important;object-position:50% 50%!important}
`;

/**
 * Keep the source's aspect ratio while filling the whole screen. The default
 * player shows the complete frame (letterboxed); this mode scales the picture
 * until it covers the screen and crops the overflow instead of stretching.
 */
export function attachAspectFullscreen(art: Artplayer) {
  const root = art.template.$player;
  const document = root.ownerDocument as FullscreenDocument;
  const video = art.video;
  const style = document.createElement('style');
  style.dataset.crayonAspectFullscreenStyle = '';
  style.textContent = styles;
  root.append(style);
  let enabled = preferred();
  const fullscreen = () => !art.isDestroy && (document.fullscreenElement === root || document.webkitFullscreenElement === root || !!art.fullscreenWeb);
  const sync = () => { root.dataset.crayonAspectFullscreen = String(enabled && fullscreen()); };
  const change = (event: Event) => { enabled = !!(event as CustomEvent).detail; sync(); };
  root.addEventListener(ASPECT_FULLSCREEN_CHANGE, change);
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  video.addEventListener('loadedmetadata', sync);
  art.on('fullscreen', sync);
  art.on('fullscreenWeb', sync);
  art.on('resize', sync);
  sync();
  return () => {
    root.removeEventListener(ASPECT_FULLSCREEN_CHANGE, change);
    document.removeEventListener('fullscreenchange', sync);
    document.removeEventListener('webkitfullscreenchange', sync);
    video.removeEventListener('loadedmetadata', sync);
    art.off('fullscreen', sync);
    art.off('fullscreenWeb', sync);
    art.off('resize', sync);
    style.remove();
    delete root.dataset.crayonAspectFullscreen;
  };
}
