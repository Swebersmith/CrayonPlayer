import Hls from 'hls.js';
import type { PlaybackSource } from './src/source-selector';
import { vodAdLoader } from './src/vod-ad-filter';

export type PlaybackConnectionMode = 'auto' | 'server' | 'browser';
export const connectionModes = [
  { value: 'auto', label: '自动回退' },
  { value: 'server', label: '后端转发' },
  { value: 'browser', label: '浏览器直连' },
] as const;
const connectionKey = 'crayonplayer-playback-connection';
export function playbackConnectionPreference(): PlaybackConnectionMode {
  try {
    const saved = localStorage.getItem(connectionKey);
    if (saved === 'server' || saved === 'browser') return saved;
  } catch { /* Storage is optional. */ }
  return 'auto';
}
export function savePlaybackConnection(mode: PlaybackConnectionMode) {
  try { localStorage.setItem(connectionKey, mode); } catch { /* Storage is optional. */ }
}

export interface BrowserRoute extends PlaybackSource {
  originalUrl?: string;
  transport?: string;
  sourceId?: string;
  durationSeconds?: number;
  latencyMs?: number;
  quality?: { width: number; height: number; label?: string };
  match?: { title: string; episodeTitle: string; sourceName: string; sourceId?: string; lineName?: string; episodeNumber?: number; episodeKey?: string };
}

function durationConflict(route: BrowserRoute, observations: BrowserRoute[]) {
  if (!route.durationSeconds) return false;
  const duration = route.durationSeconds;
  const sourceId = route.match?.sourceId || route.sourceId;
  const longer = observations.filter(other => (other.match?.sourceId || other.sourceId) !== sourceId && other.url !== route.url
    && other.durationSeconds && other.durationSeconds > duration * 2 && other.durationSeconds - duration >= 300);
  return longer.some(reference => {
    if (reference.durationSeconds! >= duration * 4) return true;
    const peers = longer.filter(other => other.durationSeconds! >= reference.durationSeconds! && other.durationSeconds! <= reference.durationSeconds! * 1.15);
    return new Set(peers.map(other => other.match?.sourceId || other.sourceId)).size >= 2 && new Set(peers.map(other => other.originalUrl || other.url)).size >= 2;
  });
}
interface BrowserPlayback {
  url?: string;
  direct?: boolean;
  selectedRouteId?: string;
  routes?: BrowserRoute[];
  browserRoutes?: BrowserRoute[];
  unavailableRoutes?: BrowserRoute[];
}

export function probeBrowserRoute(route: BrowserRoute, signal: AbortSignal): Promise<BrowserRoute> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    let hls: Hls | undefined;
    let originalDuration = route.durationSeconds;
    const started = performance.now();
    let firstByteMs = 0;
    const clean = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('error', failed);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
    const fail = (message: string) => { clean(); reject(new Error(message)); };
    const aborted = () => fail('浏览器直连检测已取消');
    const failed = () => fail('浏览器直连失败（网络、跨域或上游限制）');
    const ready = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      const quality = { width: video.videoWidth, height: video.videoHeight, label: video.videoWidth + '×' + video.videoHeight };
      const latencyMs = Math.max(1, Math.round(firstByteMs || performance.now() - started));
      const durationSeconds = originalDuration || (Number.isFinite(video.duration) ? video.duration : undefined);
      clean();
      resolve({ ...route, available: true, quality, latencyMs, durationSeconds });
    };
    const timer = setTimeout(() => fail('浏览器直连检测超时'), 10000);
    signal.addEventListener('abort', aborted, { once: true });
    video.addEventListener('loadeddata', ready);
    video.addEventListener('error', failed);
    if (signal.aborted) { aborted(); return; }
    try {
      const url = new URL(route.url);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('直连地址无效');
      if (route.type === 'm3u8') {
        if (!Hls.isSupported()) throw new Error('浏览器不支持当前 HLS 播放方式');
        hls = new Hls({ enableWorker: false, autoStartLoad: false, maxBufferLength: 1, maxMaxBufferLength: 2,
          manifestLoadingMaxRetry: 0, levelLoadingMaxRetry: 0, fragLoadingMaxRetry: 0,
          loader: vodAdLoader(Hls.DefaultConfig.loader, result => { if (result.originalDuration) originalDuration = result.originalDuration; }) });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const levels = hls!.levels.map((level, index) => ({ index, pixels: level.width * level.height, bitrate: level.bitrate }));
          levels.sort((a, b) => b.pixels - a.pixels || b.bitrate - a.bitrate);
          hls!.startLevel = levels[0]?.index || 0;
          hls!.startLoad();
        });
        hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
          firstByteMs = data.frag.stats.loading.first - data.frag.stats.loading.start;
        });
        hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) failed(); });
        hls.loadSource(route.url);
        hls.attachMedia(video);
      } else {
        video.src = route.url;
        video.load();
      }
    } catch (error) { fail((error as Error).message); }
  });
}

/** Promote a 403 candidate only after this browser has decoded actual video. */
export async function recoverBrowserRoutes(data: BrowserPlayback, signal: AbortSignal, mode: PlaybackConnectionMode = 'auto'): Promise<BrowserPlayback & { routes: BrowserRoute[]; unavailableRoutes: BrowserRoute[] }> {
  if (mode === 'server') return { ...data, routes: data.routes || [], unavailableRoutes: data.unavailableRoutes || [] };
  const routes = mode === 'browser' ? [] : [...(data.routes || [])];
  const unavailable = new Map((data.unavailableRoutes || []).map(route => [route.id, route]));
  const candidates = [...(data.browserRoutes || [])];
  if (mode === 'browser') {
    for (const route of data.routes || []) {
      if (!route.originalUrl) {
        unavailable.set(route.id, { ...route, available: false, url: '', reason: '当前线路缺少可直连地址' });
        continue;
      }
      candidates.push({ ...route, url: route.originalUrl, transport: 'browser',
        name: [route.match?.sourceName || route.name.split(' · ')[0], route.match?.lineName, '浏览器直连'].filter(Boolean).join(' · ') });
    }
  }
  const selected = [...new Map(candidates.map(route => [route.id, route])).values()].slice(0, 8);
  if (mode === 'auto' && !selected.length) return { ...data, routes, unavailableRoutes: [...unavailable.values()] };
  const probes = new Map<string, Promise<BrowserRoute>>();
  for (let offset = 0; offset < selected.length; offset += 4) {
    if (signal.aborted) throw new Error('浏览器直连检测已取消');
    const batch = selected.slice(offset, offset + 4);
    const results = await Promise.allSettled(batch.map(async route => {
      if (!probes.has(route.url)) probes.set(route.url, probeBrowserRoute(route, signal));
      const probe = await probes.get(route.url)!;
      return { ...route, available: true, quality: probe.quality, latencyMs: probe.latencyMs, durationSeconds: probe.durationSeconds,
        name: route.name + ' · ' + probe.quality?.label + ' · ' + probe.latencyMs + 'ms' };
    }));
    results.forEach((result, index) => {
      const candidate = batch[index];
      if (result.status === 'fulfilled') {
        const route = result.value;
        routes.push(route);
        unavailable.delete(route.id);
      } else {
        unavailable.set(candidate.id, { ...candidate, available: false, url: '', reason: (mode === 'auto' ? '后端 403，' : '') + (result.reason as Error).message });
      }
    });
  }
  if (signal.aborted) throw new Error('浏览器直连检测已取消');
  const observations = [...(data.routes || []), ...routes, ...unavailable.values()];
  for (let index = routes.length - 1; index >= 0; index--) {
    const route = routes[index];
    if (!durationConflict(route, observations)) continue;
    unavailable.set(route.id, { ...route, available: false, url: '', reason: '片源时长与其他源差异过大，需核对' });
    routes.splice(index, 1);
  }
  routes.sort((a, b) => (b.quality?.width || 0) * (b.quality?.height || 0) - (a.quality?.width || 0) * (a.quality?.height || 0)
    || (a.latencyMs || Infinity) - (b.latencyMs || Infinity));
  return { ...data, ...routes[0], url: routes[0]?.url, direct: false, routes, unavailableRoutes: [...unavailable.values()], selectedRouteId: routes[0]?.id };
}
