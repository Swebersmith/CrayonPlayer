import Artplayer from 'artplayer';
import Hls from 'hls.js';
import type { SettingOption } from 'artplayer/types/setting';

import { createCrayonPlayerCore } from './core';
import { createMediaPreparer, MediaPreparationError, mediaPreparationNotice, MediaPreparer, MediaRelayMode } from './media-client';
import { EnhancementOptions } from './plugin';
import { attachVodFile, attachVodHls, attachVodRecovery, vodFilteredTime, vodSourceDuration, vodSourceTime } from './vod-playback';
import { sourceToFilteredTime } from './vod-segment-filter';
import { PLAYBACK_POLICY_CHANGE, relayModePreference, saveRelayModePreference, saveServerRelayPreference, serverRelayPreference } from './relay-settings';
import { attachVideoLibrary, VideoLibraryOptions, VideoLibraryController } from './library';

export type { CastOptions, CastSource, PreparedCastSource } from './casting';
export { attachCasting, prepareCastSdk } from './casting';
export type { CrayonPlayerCoreOptions } from './core';
export type { CrayonPlayerCoreOptions as PlayerOptions } from './core';
export { createCrayonPlayerCore } from './core';
export { toggleCrayonFullscreen } from './fullscreen';
export type { GestureOptions } from './gestures';
export { attachGestures } from './gestures';
export type { MediaPreparer, PreparedMedia, MediaPreparerAuth, MediaRelayMode } from './media-client';
export { createMediaPreparer, MediaPreparationError, mediaPreparationNotice } from './media-client';
export type { EnhancementOptions } from './plugin';
export { crayonPlayerPlugin } from './plugin';
export { filterAdsFromM3U8, vodAdLoader } from './vod-ad-filter';
export { attachVodHls, vodFilteredTime, vodSourceDuration, vodSourceTime } from './vod-playback';
export type { VodAdFilterResult, VodAdRange } from './vod-segment-filter';
export { filterVodAdSegments } from './vod-segment-filter';
export type { NetworkOptions } from './network-settings';
export type { PrefetchLanes } from './vod-network';
export type { VideoLibraryOptions, VideoLibraryController } from './library';
export { attachVideoLibrary } from './library';
export { parserRoutes, videoPlatforms, parserPage, officialPage } from './library-sources';
export type { ParserId, VideoPlatform, VideoSearchResult, VideoDetailResult } from './library-sources';
export type CrayonPlayer = Artplayer & { library?: VideoLibraryController };

type ArtOptions = ConstructorParameters<typeof Artplayer>[0];
export interface CrayonPlayerOptions {
  container: string | HTMLDivElement;
  url: string;
  title?: string;
  poster?: string;
  autoplay?: boolean;
  blockAds?: boolean;
  /** Initial server relay preference when prepareMedia is configured. Default: true. */
  serverRelay?: boolean;
  /** Relay all resources (default), or only playlists with direct media downloads. */
  relayMode?: MediaRelayMode;
  /** Scope this key to a film/episode, not to the whole site. */
  storageKey?: string;
  skip?: { enabled?: boolean; intro?: number; outro?: number };
  onNext?: () => void;
  onProgress?: (sourceTime: number, sourceDuration: number) => void;
  enhancements?: EnhancementOptions;
  /** Advanced playback settings; supplied container and URL remain authoritative. */
  player?: Partial<ArtOptions>;
  /** @deprecated Use player instead. */
  artplayer?: Partial<ArtOptions>;
  prepareMedia?: string | MediaPreparer;
  /** Optional search, episodes and parser controls inside the player's fullscreen root. */
  library?: VideoLibraryOptions;
}

/** Standalone VOD player. Host applications can also install just crayonPlayerPlugin. */
export function createCrayonPlayer(options: CrayonPlayerOptions): CrayonPlayer {
  // eslint-disable-next-line prefer-const -- Callbacks are declared before construction and close over this binding.
  let art: Artplayer;
  let destroyed = false;
  let blocked = options.blockAds !== false;
  const prepareMedia = typeof options.prepareMedia === 'string' ? createMediaPreparer(options.prepareMedia) : options.prepareMedia;
  let relay = !!prepareMedia && serverRelayPreference(options.serverRelay);
  let relayMode = relayModePreference(options.relayMode);
  const relayModeLabel = (mode: MediaRelayMode) => mode === 'playlist' ? '仅清单（分片直连）' : '全部资源';
  const playerOptions = { ...options.artplayer, ...options.player };
  let resume: number | undefined;
  let resumePlaying = false;
  let lastSave = 0;
  let advanced = false;
  let wake: { release(): Promise<void> } | undefined;
  let wakePending = false;
  let progressKey = options.storageKey;
  let identity = options.url;
  const skip = { enabled: false, intro: 0, outro: 0, ...options.skip };
  try {
    const saved = progressKey && localStorage.getItem(progressKey);
    if (saved) {
      const record = JSON.parse(saved);
      if (record.url === identity && Number.isFinite(record.time) && record.time >= 0) resume = record.time;
    }
  } catch { /* Storage is optional in private browsing. */ }
  const sourceUrl = () => art?.option.url || options.url;
  const hlsSource = () => art.option.type === 'm3u8' || /\.m3u8(?:[?#]|$)/i.test(sourceUrl());
  const preparationFailed = (error: unknown) => {
    art.loading.show = false;
    art.notice.show = mediaPreparationNotice(error);
  };
  const prepare = async (url: string) => {
    const mode = relayMode;
    const result = await (mode === 'playlist' ? prepareMedia!(url, blocked, mode) : prepareMedia!(url, blocked));
    if (mode === 'playlist' && result.relayMode !== 'playlist') {
      throw new MediaPreparationError('中转服务不支持仅清单模式，请更新服务后重试','MODE_UNSUPPORTED');
    }
    return result;
  };
  const preparePlayback = () => relay && prepareMedia ? prepare : undefined;
  const fileType = (video: HTMLVideoElement, url: string) => attachVodFile(video, url, preparePlayback(), preparationFailed);
  const hlsType = (video: HTMLVideoElement, url: string) => {
    // Local playback always uses Crayon's MSE/MMS engine and inline controls.
    const hls = attachVodHls(video, url, () => {
      queueMicrotask(() => {
        if (!destroyed) {
          art.loading.show = false;
          art.notice.show = '此浏览器不支持 Crayon 网页播放，请更新浏览器后重试';
        }
      });
    }, blocked,
      result => {
        const seconds = result.removed.reduce((sum, range) => sum + range.end - range.start, 0);
        art.setting.update({ name: 'blockAds', html: '去广告', switch: blocked, tooltip: !blocked ? '' : seconds ? `已过滤 ${seconds.toFixed(1)} 秒` : result.reason === 'unsupported' ? '已开启 · 当前格式暂不支持过滤' : '已开启 · 未识别出可过滤广告' });
      },
      preparePlayback(), preparationFailed, options.enhancements?.network);
    if (hls) attachVodRecovery(hls, () => {
      if (destroyed) return;
      art.loading.show = false;
      art.notice.show = '视频加载失败，请重试或更换片源';
    });
  };
  const restartPlayback = () => {
    resume = resume ?? vodSourceTime(art.video);
    resumePlaying = resumePlaying || art.playing;
    // Invalidate a TV URL prepared under either previous switch state, including
    // a picker that is still pending. Local playback keeps the original time.
    art.template.$player.dispatchEvent(new Event(PLAYBACK_POLICY_CHANGE));
    if (hlsSource()) hlsType(art.video, sourceUrl());
    else fileType(art.video, sourceUrl());
  };
  const next = () => {
    if (advanced) return;
    advanced = true;
    if (options.onNext) options.onNext();
    else art.pause();
  };
  art = createCrayonPlayerCore({
    poster: options.poster || '', autoplay: options.autoplay ?? false, volume: 0.7,
    pip: true, setting: true, playbackRate: true, fullscreen: true,
    fullscreenWeb: true, airplay: true, playsInline: true, lock: true,
    autoOrientation: true, theme: '#a1e6d0', lang: 'zh-cn',
    ...playerOptions,
    container: options.container, url: options.url, id: playerOptions.id || 'crayon-player',
    customType: { m3u8: hlsType, mp4: fileType, ...playerOptions.customType },
    settings: [
      { name: 'blockAds', html: '去广告', switch: blocked, onSwitch(item) {
        if (hlsSource() && !Hls.isSupported()) {
          art.notice.show = '此浏览器不支持 Crayon 网页播放';
          return item.switch;
        }
        blocked = !item.switch;
        item.tooltip = '';
        restartPlayback();
        return blocked;
      } },
      ...(prepareMedia ? [{ name: 'serverRelay', html: '服务器中转', switch: relay,
        tooltip: '关闭后浏览器直连；去广告单独控制',
        onSwitch(item: SettingOption) {
          relay = !item.switch;
          saveServerRelayPreference(relay);
          restartPlayback();
          return relay;
        },
      }, {
        name: 'relayMode', html: '中转方式', tooltip: relayModeLabel(relayMode),
        selector: (['full', 'playlist'] as const).map(mode => ({
          html: relayModeLabel(mode), value: mode, default: mode === relayMode,
        })),
        onSelect(item: SettingOption) {
          const selected = item.value as MediaRelayMode;
          if (selected === relayMode) return relayModeLabel(relayMode);
          relayMode = selected;
          saveRelayModePreference(relayMode);
          if (relay) restartPlayback();
          else art.notice.show = '已保存中转方式，开启服务器中转后生效';
          return relayModeLabel(relayMode);
        },
      }] : []),
      { name: 'crayonSkip', html: '跳过片头片尾', switch: skip.enabled, onSwitch: item => (skip.enabled = !item.switch) },
      { html: '设置片头', onClick() { skip.intro = vodSourceTime(art.video); return `${Math.floor(skip.intro)} 秒`; } },
      { html: '设置片尾', onClick() { skip.outro = Math.max(0, vodSourceDuration(art.video) - vodSourceTime(art.video)); return `${Math.floor(skip.outro)} 秒`; } },
      { html: '删除跳过配置', onClick() {
        skip.enabled = false; skip.intro = 0; skip.outro = 0;
        art.setting.find('crayonSkip').switch = false;
        return '已清除';
      } },
      ...(playerOptions.settings || []),
    ],
    controls: [
      ...(options.onNext ? [{ name: 'nextEpisode', html: '下一集', position: 'left' as const, index: 13, click: next }] : []),
      ...(playerOptions.controls || []),
    ],
  }, {
    ...options.enhancements,
    casting: options.enhancements?.casting === false ? false : {
      getSource: () => ({ url: sourceUrl(), title: art.title, currentTime: vodSourceTime(art.video) }),
      getHint: () => {
        if (!relay) return blocked ? '服务器中转已关闭；本机去广告仅在当前设备生效，电视直连原始片源。' : '服务器中转已关闭；电视需能直接访问原始片源。';
        if (relayMode === 'playlist') {
          if (!hlsSource()) return '仅清单中转；当前文件由电视直连片源，不进行清单去广告。';
          return `仅清单中转；${blocked ? '电视使用服务端去广告清单' : '去广告已关闭'}，视频分片和密钥由电视直连片源，片源须允许跨域访问。`;
        }
        return blocked ? '服务器中转已开启；电视使用服务端去广告清单，识别结果取决于片源。' : '服务器中转已开启；去广告已关闭，电视播放完整清单。';
      },
      ...(prepareMedia ? { prepareSource: async (source: { url: string; title?: string }) => {
        if (!relay) return { ...source, mapTime: (time: number) => time };
        const prepared = await prepare(source.url);
        return { ...source,...prepared, mapTime: (time: number) => sourceToFilteredTime(prepared.filter.removed,time) };
      } } : {}),
      ...options.enhancements?.casting,
    },
  });
  function save() {
    if (destroyed || !Number.isFinite(art.currentTime)) return;
    const time = vodSourceTime(art.video);
    const duration = vodSourceDuration(art.video);
    try { if (progressKey) localStorage.setItem(progressKey, JSON.stringify({ url: identity, time })); } catch { /* optional */ }
    options.onProgress?.(time, duration);
  }
  async function releaseWake() {
    const lock = wake;
    wake = undefined;
    try { await lock?.release(); } catch { /* already released */ }
  }
  async function acquireWake() {
    if (wake || wakePending || destroyed || !art.playing || document.hidden) return;
    const navigatorWithWake = navigator as Navigator & { wakeLock?: { request(type: string): Promise<{ release(): Promise<void>; addEventListener(type: string, callback: () => void): void }> } };
    if (!navigatorWithWake.wakeLock) return;
    wakePending = true;
    try {
      const lock = await navigatorWithWake.wakeLock.request('screen');
      if (destroyed || !art.playing || document.hidden) { await lock.release(); return; }
      wake = lock;
      lock.addEventListener('release', () => { if (wake === lock) wake = undefined; });
    } catch { /* Permission or platform may deny screen wake lock. */ }
    finally { wakePending = false; }
  }
  const visibility = () => { if (document.hidden) { save(); void releaseWake(); } else void acquireWake(); };
  art.on('video:canplay', () => {
    if (resume !== undefined) {
      art.currentTime = Math.min(vodFilteredTime(art.video, resume), Math.max(0, art.duration - 1));
      resume = undefined;
    }
    if (resumePlaying) {
      resumePlaying = false;
      void Promise.resolve(art.play()).catch(() => { /* A browser may require a new tap. */ });
    }
  });
  art.on('video:timeupdate', () => {
    if (Date.now() - lastSave > 5000) { save(); lastSave = Date.now(); }
    if (!skip.enabled) return;
    const time = vodSourceTime(art.video);
    const duration = vodSourceDuration(art.video);
    if (skip.intro > 0 && time < skip.intro && skip.intro < duration) art.seek = vodFilteredTime(art.video, skip.intro);
    if (skip.outro > 0 && duration > 0 && time >= duration - skip.outro) next();
  });
  art.on('video:ended', () => { save(); void releaseWake(); next(); });
  art.on('play', () => { void acquireWake(); });
  art.on('pause', () => { save(); void releaseWake(); });
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', save);
  art.on('destroy', () => {
    save();
    destroyed = true;
    delete art.video.vodNativeRequest;
    void releaseWake();
    art.video.hls?.destroy();
    delete art.video.hls;
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', save);
  });
  art.title = options.title || '';
  const player = art as CrayonPlayer;
  if (options.library) player.library = attachVideoLibrary(art, options.library, {
    initialUrl: options.url,
    suspend: () => {
      save(); art.pause();
      art.template.$player.dispatchEvent(new Event(PLAYBACK_POLICY_CHANGE));
      delete art.video.vodNativeRequest;
      art.video.hls?.destroy(); art.video.vodNetwork?.destroy();
      delete art.video.hls; delete art.video.vodAdFilter;
      art.video.removeAttribute('src'); art.video.load();
      art.loading.show = false;
    },
    media: (url, original, type, title) => {
      identity = original; progressKey = `crayon-library:${original}`;
      resume = undefined; resumePlaying = false; advanced = false; lastSave = 0;
      try {
        const saved = JSON.parse(localStorage.getItem(progressKey) || 'null');
        if (saved?.url === identity && Number.isFinite(saved.time) && saved.time >= 0) resume = saved.time;
      } catch { /* Storage is optional. */ }
      art.option.type = type; art.option.url = url; art.title = title || options.title || 'Crayon Player';
      if (type === 'm3u8' || /\.m3u8(?:[?#]|$)/i.test(url)) hlsType(art.video, url);
      else fileType(art.video, url);
    },
  });
  return player;
}
