import type Artplayer from 'artplayer';

import { attachCasting, CastOptions } from './casting';
import { attachGestures, GestureOptions } from './gestures';
import { attachPlayerUi } from './player-ui';
import { attachProgress } from './progress';
import { attachNetworkSpeed, NetworkOptions } from './network-settings';
import { attachResponsiveLayout } from './responsive';

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
    const disposeGestures = options.gestures === false ? undefined : attachGestures(art, options.gestures);
    const disposeCast = options.casting ? attachCasting(art, options.casting) : undefined;
    const disposeResponsive = attachResponsiveLayout(art);
    let disposed = false;
    const destroy = () => {
      if (disposed) return;
      disposed = true;
      disposeGestures?.();
      disposeResponsive();
      disposeProgress();
      disposeNetwork();
      disposeCast?.();
      disposeUi();
    };
    art.on('destroy', destroy);
    return { name: 'crayonPlayer', destroy };
  };
}
