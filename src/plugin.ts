import type Artplayer from 'artplayer';

import { attachCasting, CastOptions } from './casting';
import { attachGestures, GestureOptions } from './gestures';
import { attachPlayerUi } from './player-ui';
import { attachProgress } from './progress';
import { attachNetworkSpeed, NetworkOptions } from './network-settings';
import { attachResponsiveLayout } from './responsive';
import { attachAspectFullscreen } from './aspect-fullscreen';
import { attachPlaybackStats } from './playback-stats';
import { attachQuality } from './quality';
import { attachPictureEnhancement } from './picture-enhancement';

export interface EnhancementOptions {
  gestures?: GestureOptions | false;
  casting?: CastOptions | false;
  network?: NetworkOptions;
}

/** ArtPlayer plugin; install with fastForward:false and gesture:false to avoid duplicate gestures. */
export function crayonPlayerPlugin(options: EnhancementOptions = {}) {
  return (art: Artplayer) => {
    const disposeUi = attachPlayerUi(art,options.gestures !== false);
    const disposeProgress = attachProgress(art);
    const disposeNetwork = attachNetworkSpeed(art, options.network?.showNetworkSpeed);
    const disposeStats = attachPlaybackStats(art);
    const disposeQuality = attachQuality(art);
    const disposePicture = attachPictureEnhancement(art);
    const disposeGestures = options.gestures === false ? undefined : attachGestures(art, options.gestures);
    const disposeCast = options.casting ? attachCasting(art, options.casting) : undefined;
    const disposeResponsive = attachResponsiveLayout(art);
    const disposeAspectFullscreen = attachAspectFullscreen(art);
    let disposed = false;
    const destroy = () => {
      if (disposed) return;
      disposed = true;
      disposeGestures?.();
      disposeAspectFullscreen();
      disposeResponsive();
      disposeProgress();
      disposeNetwork();
      disposeStats();
      disposeQuality();
      disposePicture();
      disposeCast?.();
      disposeUi();
    };
    art.on('destroy', destroy);
    return { name: 'crayonPlayer', destroy };
  };
}
