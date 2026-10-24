import Hls from 'hls.js';

import { configureInlineVideo } from './inline-video';
import { vodAdLoader } from './vod-ad-filter';
import { prefetchPreference } from './network-settings';
import { NetworkOptions } from './network-settings';
import { VodNetwork } from './vod-network';
import {
  filteredToSourceTime,
  sourceToFilteredTime,
  VodAdFilterResult,
} from './vod-segment-filter';

declare global {
  interface HTMLVideoElement {
    hls?: Hls;
    vodAdFilter?: VodAdFilterResult;
    vodNativeRequest?: object;
    /** Preparation blocks local playback until a filtered source or loader is ready. */
    vodNativePending?: boolean;
    vodPlaybackUrl?: string;
  }
}

function resetPlayback(video: HTMLVideoElement) {
  configureInlineVideo(video);
  video.hls?.destroy();
  video.vodNetwork?.destroy();
  delete video.hls;
  delete video.vodAdFilter;
  delete video.vodPlaybackUrl;
  // Clear the previous episode or explicit casting source before preparation.
  const hadSource = video.hasAttribute('src') || !!video.querySelector('source');
  video.removeAttribute('src');
  video.querySelectorAll('source').forEach(source => source.remove());
  if (hadSource) video.load();
  const request = {};
  video.vodNativeRequest = request;
  video.vodNativePending = false;
  return request;
}

/** MP4 uses the same independent relay policy and stale-request protection. */
export function attachVodFile(
  video: HTMLVideoElement,
  url: string,
  prepareSource?: (url: string) => Promise<{ url: string; filter: VodAdFilterResult }>,
  onPreparationError?: (error: unknown) => void
) {
  const request = resetPlayback(video);
  const load = (playbackUrl: string) => {
    if (video.vodNativeRequest !== request) return;
    video.vodNativePending = false;
    video.vodPlaybackUrl = playbackUrl;
    video.src = playbackUrl;
  };
  if (!prepareSource) { load(url); return; }
  video.vodNativePending = true;
  const failed = (error: unknown) => {
    if (video.vodNativeRequest !== request) return;
    video.vodNativePending = false;
    onPreparationError?.(error);
  };
  try { void prepareSource(url).then(prepared => load(prepared.url)).catch(failed); }
  catch (error) { failed(error); }
}

export function attachVodHls(
  video: HTMLVideoElement,
  url: string,
  onUnsupported: () => void,
  blockAds = true,
  onAdFilter?: (result: VodAdFilterResult) => void,
  prepareSource?: (url: string) => Promise<{ url: string; filter: VodAdFilterResult }>,
  onPreparationError?: (error: unknown) => void,
  networkOptions: NetworkOptions = {}
): Hls | null {
  const request = resetPlayback(video);
  const mse = Hls.isSupported();
  // Local HLS always stays in Crayon's MSE/MMS player. A native HLS capability
  // must never switch the phone to a different playback path or system UI.
  if (!mse) {
    delete video.vodNativeRequest;
    onUnsupported();
    return null;
  }
  // MMS can open without an HTTP alternative when remote playback is disabled.
  // Only an explicit cast action installs a TV source and enables it again.
  video.disableRemotePlayback = true;
  const preparedPlayback = !!prepareSource;
  const network = new VodNetwork(video, prefetchPreference(networkOptions.prefetchLanes));
  const hls: Hls = new Hls({
    debug: false,
    enableWorker: true,
    lowLatencyMode: false,
    // VOD can download ahead instead of staying close to a live edge.
    maxBufferLength: 60,
    maxMaxBufferLength: 120,
    backBufferLength: 30,
    maxBufferSize: 60 * 1000 * 1000,
    maxBufferHole: 0.3,
    fLoader: network.fragmentLoader,
    // Filter actual ad segment groups while preserving retained HLS state.
    loader: blockAds && !preparedPlayback
      ? vodAdLoader(Hls.DefaultConfig.loader, result => {
          if (video.hls !== hls) return;
          video.vodAdFilter = result;
          onAdFilter?.(result);
        })
      : Hls.DefaultConfig.loader,
  });
  video.hls = hls;
  video.vodNetwork = network;
  network.attach(hls);
  hls.on(Hls.Events.DESTROYING, () => {
    if (video.hls === hls) delete video.hls;
    if (video.vodNativeRequest === request) {
      delete video.vodNativeRequest;
      video.vodNativePending = false;
    }
  });
  const load = (playbackUrl: string, filter?: VodAdFilterResult) => {
    if (video.vodNativeRequest !== request || video.hls !== hls) return;
    video.vodNativePending = false;
    video.vodPlaybackUrl = playbackUrl;
    if (filter) video.vodAdFilter = filter;
    hls.loadSource(playbackUrl);
    hls.attachMedia(video);
    if (filter) onAdFilter?.(filter);
  };
  if (preparedPlayback && prepareSource) {
    video.vodNativePending = true;
    const failed = (error: unknown) => {
      if (video.vodNativeRequest !== request) return;
      video.vodNativePending = false;
      hls.destroy();
      onPreparationError?.(error);
    };
    try {
      void prepareSource(url).then(prepared => load(prepared.url, prepared.filter)).catch(failed);
    } catch (error) { failed(error); }
  } else load(url);
  return hls;
}

/** Bound fatal recovery instead of leaving the player in an endless load loop. */
export function attachVodRecovery(hls: Hls, onFailure: () => void) {
  let attempts = 0;
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) return;
    if (++attempts <= 3 && data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
    else if (attempts <= 3 && data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
    else { hls.destroy(); onFailure(); }
  });
  hls.on(Hls.Events.FRAG_LOADED, () => { attempts = 0; });
}

/** Explicit casting only. Preserve the MMS blob while installing a TV URL. */
export function setHlsAlternative(video: HTMLVideoElement, url: string) {
  video.querySelectorAll('source').forEach(source => {
    if (!source.src.startsWith('blob:')) source.remove();
  });
  const source = document.createElement('source');
  source.src = url;
  source.type = 'application/vnd.apple.mpegurl';
  video.appendChild(source);
  video.disableRemotePlayback = false;
  video.removeAttribute('disableRemotePlayback');
}

export function vodSourceTime(
  video: HTMLVideoElement | undefined,
  time = video?.currentTime || 0
): number {
  return filteredToSourceTime(video?.vodAdFilter?.removed || [], time);
}

export function vodFilteredTime(
  video: HTMLVideoElement | undefined,
  time: number
): number {
  return sourceToFilteredTime(video?.vodAdFilter?.removed || [], time);
}

export function vodSourceDuration(
  video: HTMLVideoElement | undefined,
  duration = video?.duration || 0
): number {
  return video?.vodAdFilter?.originalDuration || duration;
}
