import type Artplayer from 'artplayer';
import type { Setting } from 'artplayer/types/setting';

import { seekAndSync, setScrubbing } from './progress';

export interface GestureOptions {
  seekSeconds?: number;
  holdRate?: number;
  holdDelay?: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type Zone = 'left' | 'center' | 'right';

const RESET_VIEW = 'crayon-reset-video-view';
export function videoViewSetting(): Setting {
  return {
    name: 'crayonResetView', html: '画面复位', tooltip: '双指缩放、移动画面',
    onClick() {
      this.template.$player.dispatchEvent(new Event(RESET_VIEW));
      this.notice.show = '已恢复画面';
      return '双指缩放、移动画面';
    },
  };
}

/** Own only touches on the picture. Native controls, mouse and lock stay usable. */
export function attachGestures(art: Artplayer, options: GestureOptions = {}) {
  const root = art.template.$player;
  const video = art.video;
  const seekSeconds = options.seekSeconds ?? 10;
  const holdRate = options.holdRate ?? 2;
  const originalTouchAction = video.style.touchAction;
  const originalTranslate = video.style.translate || '';
  const originalScale = video.style.scale || '';
  video.style.touchAction = 'none';
  let view = { scale: 1, x: 0, y: 0 };
  let pinch: { ids: number[]; distance: number; x: number; y: number; scale: number; offsetX: number; offsetY: number } | undefined;
  let finishingPinch = false;
  const point = (touches: TouchList) => {
    const a = touches[0], b = touches[1];
    const rect = root.getBoundingClientRect();
    const x = (a.clientX + b.clientX) / 2 - (rect.left + rect.width / 2);
    const y = (a.clientY + b.clientY) / 2 - (rect.top + rect.height / 2);
    return { x: art.isRotate ? y : x, y: art.isRotate ? -x : y,
      distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)) };
  };
  const resetView = () => {
    view = { scale: 1, x: 0, y: 0 };
    video.style.translate = originalTranslate;
    video.style.scale = originalScale;
  };
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let tapTimer: ReturnType<typeof setTimeout> | undefined;
  let lastTap: { x: number; y: number; zone: Zone; time: number } | undefined;
  let suppressClickUntil = 0;
  let active: {
    id: number; x: number; y: number; zone: Zone;
    time: number; volume: number; rate: number;
    direction?: 'horizontal' | 'vertical'; held: boolean;
  } | undefined;

  const picture = (target: EventTarget | null) => target === video;
  const stop = (event: Event) => {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  };
  const clearTap = () => {
    clearTimeout(tapTimer);
    lastTap = undefined;
  };
  const restoreRate = () => {
    clearTimeout(holdTimer);
    if (active?.held) art.playbackRate = active.rate;
  };
  const cancel = () => {
    restoreRate();
    if (active?.direction === 'horizontal') setScrubbing(art, false);
    active = undefined;
    pinch = undefined;
    finishingPinch = false;
    clearTap();
  };
  const seek = (time: number) => {
    if (art.option.isLive || !Number.isFinite(art.duration) || art.duration <= 0) return;
    seekAndSync(art, time);
  };
  const start = (event: TouchEvent) => {
    if (!picture(event.target) || art.isLock) return;
    if (finishingPinch) { stop(event); return; }
    if (event.touches.length === 2) {
      cancel();
      stop(event);
      const center = point(event.touches);
      pinch = { ...center, ids: Array.from(event.touches, touch => touch.identifier),
        scale: view.scale, offsetX: view.x, offsetY: view.y };
      suppressClickUntil = Date.now() + 1000;
      return;
    }
    if (event.touches.length !== 1) { cancel(); stop(event); return; }
    cancelActive();
    stop(event);
    const touch = event.touches[0];
    const rect = video.getBoundingClientRect();
    active = {
      id: touch.identifier, x: touch.clientX, y: touch.clientY,
      zone: (() => {
        const ratio = art.isRotate
          ? (touch.clientY - rect.top) / rect.height
          : (touch.clientX - rect.left) / rect.width;
        return ratio < 1 / 3 ? 'left' : ratio > 2 / 3 ? 'right' : 'center';
      })(),
      time: art.currentTime, volume: art.volume,
      rate: art.playbackRate, held: false,
    };
    suppressClickUntil = Date.now() + 1000;
    holdTimer = setTimeout(() => {
      if (!active || active.direction || art.isLock || !art.playing || art.option.isLive) return;
      active.held = true;
      clearTap();
      art.playbackRate = Math.max(active.rate, holdRate);
      art.notice.show = `长按 ${art.playbackRate}× 加速 · 松手恢复`;
    }, options.holdDelay ?? 500);
  };
  function cancelActive() {
    restoreRate();
    if (active?.direction === 'horizontal') setScrubbing(art, false);
    active = undefined;
  }
  const move = (event: TouchEvent) => {
    if (pinch || finishingPinch) {
      stop(event);
      if (art.isLock || event.touches.length !== 2 || !pinch) return;
      if (!Array.from(event.touches).every(touch => pinch!.ids.includes(touch.identifier))) return;
      const center = point(event.touches);
      const scale = clamp(pinch.scale * center.distance / pinch.distance, 0.1, 10);
      const ratio = scale / pinch.scale;
      view = { scale, x: center.x - (pinch.x - pinch.offsetX) * ratio,
        y: center.y - (pinch.y - pinch.offsetY) * ratio };
      video.style.translate = `${view.x}px ${view.y}px`;
      video.style.scale = String(view.scale);
      art.notice.show = `画面 ${Math.round(scale * 100)}% · 双指移动`;
      return;
    }
    if (!active) return;
    stop(event);
    if (event.touches.length !== 1 || art.isLock) { cancel(); return; }
    const touch = event.touches[0];
    if (touch.identifier !== active.id) { cancel(); return; }
    const rect = video.getBoundingClientRect();
    // Map screen coordinates back to the player's axes in ArtPlayer's rotated fullscreen.
    const dx = art.isRotate ? touch.clientY - active.y : touch.clientX - active.x;
    const dy = art.isRotate ? active.x - touch.clientX : touch.clientY - active.y;
    if (!active.direction && Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
    if (!active.direction) {
      active.direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      if (active.direction === 'horizontal' && !art.option.isLive && Number.isFinite(art.duration) && art.duration > 0)
        setScrubbing(art, true, true, true);
      restoreRate();
      clearTap();
    }
    if (active.direction === 'horizontal') {
      const width = (art.isRotate ? rect.height : rect.width) || 1;
      seek(active.time + dx / width * Math.min(art.duration || 0, 300));
    } else {
      const height = (art.isRotate ? rect.width : rect.height) || 1;
      const delta = -dy / (height * 0.8);
      if (active.zone === 'right') {
        const target = clamp(active.volume + delta, 0, 1);
        art.volume = target;
        if (target > 0) art.muted = false;
        art.notice.show = Math.abs(video.volume - target) > 0.02
          ? '此浏览器限制网页音量，请使用设备音量键'
          : `音量 ${Math.round(video.volume * 100)}%`;
      }
    }
  };
  const end = (event: TouchEvent) => {
    if (pinch || finishingPinch) {
      stop(event);
      pinch = undefined;
      finishingPinch = event.touches.length > 0;
      suppressClickUntil = Date.now() + 800;
      return;
    }
    if (!active) return;
    if (!Array.from(event.changedTouches).some(t => t.identifier === active?.id)) return;
    stop(event);
    suppressClickUntil = Date.now() + 800;
    const ended = active;
    restoreRate();
    active = undefined;
    if (ended.direction === 'horizontal') setScrubbing(art, false);
    if (ended.direction || ended.held || art.isLock) { clearTap(); return; }
    const now = Date.now();
    if (lastTap && now - lastTap.time < 300 && lastTap.zone === ended.zone &&
      Math.hypot(lastTap.x - ended.x, lastTap.y - ended.y) < 80) {
      clearTap();
      if (ended.zone === 'center') {
        art.toggle();
        art.notice.show = art.playing ? '继续播放' : '已暂停';
      } else if (!art.option.isLive) {
        const before = art.currentTime;
        seek(before + (ended.zone === 'right' ? seekSeconds : -seekSeconds));
        art.notice.show = `${ended.zone === 'right' ? '快进' : '快退'} ${Math.abs(Math.round(art.currentTime - before))} 秒`;
      }
    } else {
      clearTimeout(tapTimer);
      lastTap = { x: ended.x, y: ended.y, zone: ended.zone, time: now };
      tapTimer = setTimeout(() => {
        lastTap = undefined;
        if (!art.isLock && !art.isDestroy) art.controls.toggle();
      }, 300);
    }
  };
  const click = (event: MouseEvent) => {
    if (picture(event.target) && Date.now() < suppressClickUntil) stop(event);
  };
  const context = (event: Event) => { if (active && picture(event.target)) stop(event); };
  const visibility = () => { if (document.hidden) cancel(); };
  root.addEventListener('touchstart', start, { capture: true, passive: false });
  root.addEventListener('touchmove', move, { capture: true, passive: false });
  window.addEventListener('touchend', end, { capture: true, passive: false });
  window.addEventListener('touchcancel', cancel, true);
  root.addEventListener('click', click, true);
  root.addEventListener('dblclick', click, true);
  root.addEventListener('contextmenu', context, true);
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', visibility);
  video.addEventListener('loadstart', cancel);
  root.addEventListener(RESET_VIEW, resetView);
  art.on('lock', cancel);
  return () => {
    cancel();
    video.style.touchAction = originalTouchAction;
    resetView();
    root.removeEventListener('touchstart', start, true);
    root.removeEventListener('touchmove', move, true);
    window.removeEventListener('touchend', end, true);
    window.removeEventListener('touchcancel', cancel, true);
    root.removeEventListener('click', click, true);
    root.removeEventListener('dblclick', click, true);
    root.removeEventListener('contextmenu', context, true);
    window.removeEventListener('blur', cancel);
    document.removeEventListener('visibilitychange', visibility);
    video.removeEventListener('loadstart', cancel);
    root.removeEventListener(RESET_VIEW, resetView);
    art.off('lock', cancel);
  };
}
