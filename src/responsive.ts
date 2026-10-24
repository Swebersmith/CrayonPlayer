import type Artplayer from 'artplayer';
import type { Setting } from 'artplayer/types/setting';

type PlayerOptions = ConstructorParameters<typeof Artplayer>[0];
type PipVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

/** Secondary controls stay available in settings when the control row is small. */
export function responsiveSettings(options: PlayerOptions): Setting[] {
  const settings: Setting[] = [];
  if (options.pip) settings.push({
    name: 'crayonCompactPip', html: '画中画',
    async onClick() {
      this.setting.show = false;
      const video = this.video as PipVideo;
      try {
        if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
        else if (document.pictureInPictureEnabled && video.requestPictureInPicture) await video.requestPictureInPicture();
        else if (video.webkitSupportsPresentationMode?.('picture-in-picture') && video.webkitSetPresentationMode)
          video.webkitSetPresentationMode(video.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
        else this.notice.show = '此浏览器暂不支持画中画';
      } catch { this.notice.show = '暂时无法进入画中画，请先播放视频并检查浏览器权限'; }
    },
  });
  if (options.fullscreenWeb) settings.push({
    name: 'crayonCompactFullscreenWeb', html: '网页全屏',
    onClick() { this.setting.show = false; this.fullscreenWeb = !this.fullscreenWeb; },
  });
  if (options.screenshot) settings.push({
    name: 'crayonCompactScreenshot', html: '截图',
    onClick() {
      this.setting.show = false;
      try { this.screenshot(); } catch { this.notice.show = '当前片源暂不支持截图'; }
    },
  });
  if (options.airplay) settings.push({
    name: 'crayonCompactAirplay', html: 'AirPlay / 系统投屏',
    onClick(_item, _element, event) {
      event.stopPropagation(); this.setting.show = false;
      this.template.$player.querySelector<HTMLElement>('.art-control-airplay')?.click();
    },
  });
  settings.push({
    name: 'crayonCompactCast', html: '投屏',
    onClick(_item, _element, event) {
      event.stopPropagation(); this.setting.show = false;
      this.template.$player.querySelector<HTMLButtonElement>('button[aria-label="投屏"]')?.click();
    },
  });
  return settings;
}

const styles = `
.art-video-player[data-crayon-responsive]{--crayon-safe-top:0px;--crayon-safe-bottom:0px;--crayon-safe-left:0px;--crayon-safe-right:0px;-webkit-text-size-adjust:100%;text-size-adjust:100%}
.art-video-player[data-crayon-responsive].art-fullscreen,.art-video-player[data-crayon-responsive].art-fullscreen-web{--crayon-safe-top:env(safe-area-inset-top,0px);--crayon-safe-bottom:env(safe-area-inset-bottom,0px);--crayon-safe-left:env(safe-area-inset-left,0px);--crayon-safe-right:env(safe-area-inset-right,0px)}
.art-video-player[data-crayon-responsive].art-fullscreen-web.art-auto-orientation{--crayon-safe-top:env(safe-area-inset-right,0px);--crayon-safe-bottom:env(safe-area-inset-left,0px);--crayon-safe-left:env(safe-area-inset-top,0px);--crayon-safe-right:env(safe-area-inset-bottom,0px)}
.art-video-player[data-crayon-responsive] .art-bottom{box-sizing:border-box;padding-left:calc(var(--art-padding) + var(--crayon-safe-left));padding-right:calc(var(--art-padding) + var(--crayon-safe-right));padding-bottom:var(--crayon-safe-bottom);transition-property:opacity}
.art-video-player[data-crayon-responsive] .art-controls-left{margin-left:0!important}
.art-video-player[data-crayon-responsive] .art-controls-right{margin-right:0!important}
.art-video-player[data-crayon-responsive] [data-crayon-progress-time]{top:calc(var(--art-padding) + var(--crayon-safe-top))!important;left:calc(var(--art-padding) + var(--crayon-safe-left))!important;max-width:calc(100% - 2 * var(--art-padding) - var(--crayon-safe-left) - var(--crayon-safe-right))!important;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.art-video-player[data-crayon-responsive] [data-crayon-mini-progress]{left:var(--crayon-safe-left)!important;right:var(--crayon-safe-right)!important;bottom:var(--crayon-safe-bottom)!important}
.art-video-player[data-crayon-responsive] .art-notice-inner{max-width:100%;box-sizing:border-box;line-height:1.5;overflow-wrap:anywhere}
.art-video-player[data-crayon-responsive] .art-settings{max-width:calc(100% - 2 * var(--art-padding) - var(--crayon-safe-left) - var(--crayon-safe-right));box-sizing:border-box;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;transition-property:opacity}
.art-video-player[data-crayon-responsive] [data-name^="crayonCompact"]{display:none}
.art-video-player[data-crayon-compact=true]{--art-control-height:44px;--art-control-icon-size:28px;--art-control-icon-scale:1;--art-padding:8px;--art-indicator-size:14px;--art-state-size:56px;--art-progress-height:5px}
.art-video-player[data-crayon-compact=true] .art-controls-left,.art-video-player[data-crayon-compact=true] .art-controls-right{min-width:0;flex-shrink:0}
.art-video-player[data-crayon-compact=true] .art-controls-center{display:none}
.art-video-player[data-crayon-compact=true] .art-control-time{display:none!important}
.art-video-player[data-crayon-compact=true][data-crayon-more=true] .art-control-volume,.art-video-player[data-crayon-compact=true][data-crayon-more=true] .art-control-pip,.art-video-player[data-crayon-compact=true][data-crayon-more=true] .art-control-fullscreenWeb,.art-video-player[data-crayon-compact=true][data-crayon-more=true] .art-control-screenshot,.art-video-player[data-crayon-compact=true][data-crayon-more=true] .art-control-airplay{display:none!important}
.art-video-player[data-crayon-compact=true] .art-control .art-icon svg{width:100%;height:100%}
.art-video-player[data-crayon-compact=true] .art-control-crayonNetworkSpeed{max-width:80px!important;padding:0 4px!important}
.art-video-player[data-crayon-compact=true] [data-crayon-network-speed]{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px!important}
.art-video-player[data-crayon-compact=true] .art-control-nextEpisode{font-size:12px;padding:0 4px}
.art-video-player[data-crayon-compact=true] .art-control[class*="hint--"]:before,.art-video-player[data-crayon-compact=true] .art-control[class*="hint--"]:after{display:none}
.art-video-player[data-crayon-compact=true] .art-settings{width:340px!important;height:auto!important;left:auto!important;right:calc(var(--art-padding) + var(--crayon-safe-right))!important;bottom:calc(var(--crayon-controls-height) + var(--crayon-safe-bottom) + 6px)!important;border-radius:10px}
.art-video-player[data-crayon-compact=true] .art-setting-panel{width:100%}
.art-video-player[data-crayon-compact=true] .art-setting-item{box-sizing:border-box;min-height:42px;gap:6px}
.art-video-player[data-crayon-compact=true] .art-setting-item-left{min-width:0;flex-shrink:1!important}
.art-video-player[data-crayon-compact=true] .art-setting-item-left-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.art-video-player[data-crayon-compact=true] .art-setting-item-right{min-width:0;max-width:52%;flex-shrink:0}
.art-video-player[data-crayon-compact=true] .art-setting-item-right-tooltip{min-width:0;overflow:hidden;text-overflow:ellipsis}
.art-video-player[data-crayon-compact=true][data-crayon-more=true] [data-name="crayonCompactPip"],.art-video-player[data-crayon-compact=true][data-crayon-more=true] [data-name="crayonCompactFullscreenWeb"],.art-video-player[data-crayon-compact=true][data-crayon-more=true] [data-name="crayonCompactScreenshot"]{display:flex}
.art-video-player[data-crayon-compact=true][data-crayon-native-airplay=true] [data-name="crayonCompactAirplay"]{display:flex}
.art-video-player[data-crayon-tiny=true]{--art-control-height:40px;--art-control-icon-size:26px;--art-padding:6px;--art-state-size:44px}
.art-video-player[data-crayon-tiny=true] .art-control-crayonNetworkSpeed{max-width:58px!important;padding:0 2px!important}
.art-video-player[data-crayon-tiny=true][data-crayon-more=true] .art-control-crayonCast{display:none!important}
.art-video-player[data-crayon-tiny=true][data-crayon-cast=true] [data-name="crayonCompactCast"]{display:flex}
.art-video-player[data-crayon-wrap=true] .art-controls{height:auto;min-height:var(--art-control-height);flex-wrap:wrap}
.art-video-player[data-crayon-wrap=true] .art-controls-left,.art-video-player[data-crayon-wrap=true] .art-controls-right{height:auto;min-height:var(--art-control-height);flex-wrap:wrap;flex-basis:100%}
.art-video-player[data-crayon-responsive] [data-crayon-cast-panel]{box-sizing:border-box;max-height:var(--art-settings-max-height);max-width:calc(100% - 2 * var(--art-padding) - var(--crayon-safe-left) - var(--crayon-safe-right))!important;overflow-y:auto;overscroll-behavior:contain;right:calc(var(--art-padding) + var(--crayon-safe-right))!important;bottom:calc(var(--crayon-controls-height) + var(--crayon-safe-bottom) + 6px)!important}
.art-video-player[data-crayon-responsive] [data-crayon-gesture-guide]{overflow:hidden}
.art-video-player[data-crayon-shallow=true] [data-crayon-gesture-guide] [data-crayon-gesture-foot]{display:none}
.art-video-player[data-crayon-shallow=true] [data-crayon-gesture-guide] [data-crayon-gesture-row]{inset:15% 0!important;font-size:11px}
`;

/** Follow the actual container, including cross-site iframes and rotated fullscreen. */
export function attachResponsiveLayout(art: Artplayer) {
  const root = art.template.$player;
  const controls = root.querySelector<HTMLElement>('.art-controls');
  const style = document.createElement('style');
  style.dataset.crayonResponsiveStyle = '';
  style.textContent = styles;
  root.appendChild(style);
  const attributes = ['crayonResponsive', 'crayonCompact', 'crayonTiny', 'crayonMore', 'crayonNativeAirplay', 'crayonCast', 'crayonWrap', 'crayonShallow'];
  const previous = attributes.map(name => root.dataset[name]);
  const variables = ['--art-settings-max-height', '--crayon-player-height', '--crayon-controls-height'];
  const previousVariables = variables.map(name => [root.style.getPropertyValue(name), root.style.getPropertyPriority(name)]);
  root.dataset.crayonResponsive = 'true';
  root.dataset.crayonMore = String(!!art.option.setting && !!art.setting.find('crayonCompactCast'));
  let rotatedFullscreen = false;
  const sync = () => {
    if (!art.fullscreenWeb) rotatedFullscreen = false;
    else if (root.classList.contains('art-auto-orientation')) rotatedFullscreen = true;
    const rect = root.getBoundingClientRect();
    const width = root.clientWidth || (art.isRotate ? rect.height : rect.width);
    const height = root.clientHeight || (art.isRotate ? rect.width : rect.height);
    if (!width || !height) return;
    const compact = width <= 640;
    const changed = root.dataset.crayonCompact !== String(compact);
    root.dataset.crayonCompact = String(compact);
    root.dataset.crayonTiny = String(width < 320);
    root.dataset.crayonShallow = String(height < 220);
    root.dataset.crayonNativeAirplay = String(!!root.querySelector('.art-control-airplay'));
    root.dataset.crayonCast = String(!!root.querySelector('.art-control-crayonCast'));
    if (controls) {
      const groups = controls.querySelectorAll<HTMLElement>('.art-controls-left,.art-controls-right');
      const total = Array.from(groups).reduce((sum, group) => sum + Array.from(group.children).reduce((size, child) => size + (child as HTMLElement).offsetWidth, 0), 0);
      const bottom = getComputedStyle(art.template.$bottom);
      const available = width - (parseFloat(bottom.paddingLeft) || 0) - (parseFloat(bottom.paddingRight) || 0);
      root.dataset.crayonWrap = String(total > available + 1);
    }
    root.style.setProperty('--crayon-player-height', `${height}px`);
    root.style.setProperty('--crayon-controls-height', `${controls?.offsetHeight || (compact ? width < 320 ? 40 : 44 : 46)}px`);
    root.style.setProperty('--art-settings-max-height', 'max(0px,min(300px,calc(var(--crayon-player-height) - var(--crayon-controls-height) - var(--crayon-safe-top) - var(--crayon-safe-bottom) - 20px)))');
    if (changed) root.dispatchEvent(new Event('crayon-layout-change'));
  };
  const viewportChanged = () => {
    // ArtPlayer calculates its CSS rotation once on entry. Recalculate it when
    // a phone rotates while webpage fullscreen is already open.
    if (rotatedFullscreen && art.fullscreenWeb) {
      const width = window.innerWidth, height = window.innerHeight;
      const landscapeVideo = art.video.videoWidth > art.video.videoHeight;
      const rotate = art.video.videoWidth > 0 && landscapeVideo !== (width > height);
      root.classList.toggle('art-auto-orientation', rotate);
      // The installed autoOrientation plugin writes this runtime flag too; its
      // public declaration exposes it as readonly to ordinary consumers.
      Reflect.set(art, 'isRotate', rotate);
      root.style.width = rotate ? `${height}px` : '100%';
      root.style.height = rotate ? `${width}px` : '100%';
      root.style.transformOrigin = rotate ? '0 0' : '';
      root.style.transform = rotate ? `rotate(90deg) translate(0, -${width}px)` : '';
      art.emit('resize');
    } else sync();
  };
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(sync);
  observer?.observe(root);
  const mutation = controls && typeof MutationObserver !== 'undefined' ? new MutationObserver(sync) : undefined;
  if (controls) mutation?.observe(controls, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'hidden'] });
  art.on('resize', sync);
  window.addEventListener('resize', viewportChanged);
  sync();
  return () => {
    observer?.disconnect(); mutation?.disconnect();
    art.off('resize', sync); window.removeEventListener('resize', viewportChanged);
    style.remove();
    attributes.forEach((name, index) => { if (previous[index] === undefined) delete root.dataset[name]; else root.dataset[name] = previous[index]; });
    variables.forEach((name, index) => { if (previousVariables[index][0]) root.style.setProperty(name, previousVariables[index][0], previousVariables[index][1]); else root.style.removeProperty(name); });
  };
}
