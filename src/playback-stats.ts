import type Artplayer from 'artplayer';
import type { Setting } from 'artplayer/types/setting';

const STORAGE_KEY = 'crayon-player-playback-stats';
const CHANGE_EVENT = 'crayon-playback-stats-change';

function statsPreference() {
  try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch { return true; }
}

export function playbackStatsSetting(): Setting {
  return {
    name: 'crayonPlaybackStats', html: '播放参数显示', tooltip: '实际视频分辨率和实时呈现帧率',
    switch: statsPreference(),
    onSwitch(item) {
      const enabled = !item.switch;
      try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch { /* Storage is optional. */ }
      this.template.$player.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: enabled }));
      return enabled;
    },
  };
}

/** Measure presented frames against elapsed real time, including playback speed and dropped frames. */
export function attachPlaybackStats(art: Artplayer) {
  const video = art.video;
  const root = art.template.$player;
  const hud = document.createElement('div');
  hud.dataset.crayonPlaybackStats = '';
  hud.setAttribute('aria-label', '视频分辨率和实时帧率');
  hud.title = '当前视频帧尺寸 · 每秒实际呈现帧数（随倍速和丢帧变化）';
  hud.style.cssText = 'position:absolute;right:calc(12px + var(--crayon-safe-right,0px));bottom:calc(64px + var(--crayon-safe-bottom,0px));max-width:calc(100% - 24px);box-sizing:border-box;padding:4px 7px;border-radius:4px;background:#0009;color:white;font:12px/1.5 sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none;z-index:80';
  root.appendChild(hud);
  const frameCallbacks = typeof video.requestVideoFrameCallback === 'function';
  let enabled = false;
  let disposed = false;
  let width = 0;
  let height = 0;
  let fps: number | undefined;
  let presented: number | undefined;
  let sample: { frames: number; time: number } | undefined;
  let callback: number | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const render = () => {
    const resolution = width > 0 && height > 0 ? `${width} × ${height}` : '分辨率 —';
    const rate = fps === undefined ? '—' : fps.toFixed(2).replace(/\.00$/, '');
    hud.textContent = `${resolution} · ${rate} fps`;
  };
  const dimensions = () => {
    if (width !== video.videoWidth || height !== video.videoHeight) {
      sample = undefined;
      fps = undefined;
    }
    width = video.videoWidth;
    height = video.videoHeight;
    render();
  };
  const clearSample = () => { sample = undefined; fps = undefined; render(); };
  const frame: VideoFrameRequestCallback = (_now, metadata) => {
    callback = undefined;
    if (disposed || !enabled) return;
    presented = metadata.presentedFrames;
    if (width !== metadata.width || height !== metadata.height) {
      width = metadata.width;
      height = metadata.height;
      clearSample();
    }
    callback = video.requestVideoFrameCallback(frame);
  };
  const tick = () => {
    if (video.paused || video.ended || video.seeking || video.readyState < 2 || document.hidden) {
      clearSample();
      return;
    }
    let frames = presented;
    if (!frameCallbacks && typeof video.getVideoPlaybackQuality === 'function') {
      const quality = video.getVideoPlaybackQuality();
      frames = quality.totalVideoFrames - quality.droppedVideoFrames;
    }
    const now = performance.now();
    if (frames !== undefined && sample && now > sample.time && frames >= sample.frames) {
      fps = (frames - sample.frames) * 1000 / (now - sample.time);
    }
    sample = frames === undefined ? undefined : { frames, time: now };
    render();
  };
  const stop = () => {
    clearInterval(timer);
    timer = undefined;
    if (callback !== undefined) video.cancelVideoFrameCallback?.(callback);
    callback = undefined;
  };
  const toggle = (value: boolean) => {
    enabled = value;
    stop();
    presented = undefined;
    clearSample();
    hud.hidden = !enabled;
    if (enabled) {
      dimensions();
      if (frameCallbacks) callback = video.requestVideoFrameCallback(frame);
      timer = setInterval(tick, 1000);
    }
  };
  const reset = () => {
    toggle(enabled);
    width = 0;
    height = 0;
    render();
  };
  const change = (event: Event) => toggle((event as CustomEvent<boolean>).detail);
  const resetEvents = ['loadstart', 'emptied', 'error'];
  const sampleEvents = ['playing', 'pause', 'waiting', 'seeking', 'seeked', 'ratechange', 'ended'];
  resetEvents.forEach(event => video.addEventListener(event, reset));
  sampleEvents.forEach(event => video.addEventListener(event, clearSample));
  video.addEventListener('loadedmetadata', dimensions);
  video.addEventListener('resize', dimensions);
  document.addEventListener('visibilitychange', clearSample);
  root.addEventListener(CHANGE_EVENT, change);
  toggle(statsPreference());
  return () => {
    disposed = true;
    stop();
    resetEvents.forEach(event => video.removeEventListener(event, reset));
    sampleEvents.forEach(event => video.removeEventListener(event, clearSample));
    video.removeEventListener('loadedmetadata', dimensions);
    video.removeEventListener('resize', dimensions);
    document.removeEventListener('visibilitychange', clearSample);
    root.removeEventListener(CHANGE_EVENT, change);
    hud.remove();
  };
}
