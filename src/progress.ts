import type Artplayer from 'artplayer';
import type { Setting } from 'artplayer/types/setting';

const MINI_KEY = 'crayon-player-mini-progress';
const SCRUB_EVENT = 'crayon-scrubbing';
const MINI_EVENT = 'crayon-mini-progress-change';
const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));
const seekable = (art: Artplayer) => !art.option.isLive && Number.isFinite(art.duration) && art.duration > 0;

export function formatDuration(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const rest = seconds % 60;
  return `${hours ? `${hours}小时` : ''}${hours || minutes ? `${minutes}分钟` : ''}${rest}秒`;
}

function miniPreference(fallback = false) {
  try {
    const saved = localStorage.getItem(MINI_KEY);
    if (saved !== null) return saved === '1';
  } catch { /* Browser storage is optional. */ }
  return fallback;
}

export function miniProgressSetting(fallback = false): Setting {
  return {
    name: 'crayonMiniProgress', html: '迷你进度条', tooltip: '隐藏控制栏时显示 · 可点按拖动',
    switch: miniPreference(fallback),
    onSwitch(item) {
      const enabled = !item.switch;
      try { localStorage.setItem(MINI_KEY, enabled ? '1' : '0'); } catch { /* optional */ }
      this.template.$player.dispatchEvent(new CustomEvent(MINI_EVENT, { detail: enabled }));
      return enabled;
    },
  };
}

export function setScrubbing(art: Artplayer, active: boolean, preferMini = false) {
  const root = art.template.$player;
  if (active) {
    const mini = root.querySelector<HTMLElement>('[data-crayon-mini-progress]');
    root.dataset.crayonScrubbing = 'true';
    if (preferMini && !art.controls.show && mini && !mini.hidden) {
      root.dataset.crayonScrubbingMini = 'true';
    } else {
      delete root.dataset.crayonScrubbingMini;
      art.controls.show = true;
    }
  } else {
    delete root.dataset.crayonScrubbing;
    delete root.dataset.crayonScrubbingMini;
  }
  root.dispatchEvent(new Event(SCRUB_EVENT));
}

/** Update the bar on the input event, without waiting for the media's timeupdate. */
export function seekAndSync(art: Artplayer, time: number) {
  if (!seekable(art) || !Number.isFinite(time)) return;
  const target = clamp(time, art.duration);
  art.seek = target;
  art.emit('setBar', 'played', target / art.duration);
  art.notice.show = art.template.$player.querySelector('[data-crayon-progress-time]')
    ? '' : `${formatDuration(target)} / ${formatDuration(art.duration)}`;
}

export function attachProgress(art: Artplayer) {
  const root = art.template.$player;
  const progress = art.template.$progress;
  const notice = root.querySelector<HTMLElement>('.art-notice');
  const noticeTop = notice?.style.top || '';
  const hud = document.createElement('div');
  hud.dataset.crayonProgressTime = '';
  hud.setAttribute('aria-label', '播放进度');
  hud.style.cssText = 'position:absolute;top:var(--art-padding,10px);left:var(--art-padding,10px);max-width:calc(100% - 24px);padding:4px 7px;border-radius:4px;background:#0009;color:white;font:12px/1.5 sans-serif;font-variant-numeric:tabular-nums;pointer-events:none;z-index:81';
  const mini = document.createElement('div');
  mini.dataset.crayonMiniProgress = '';
  mini.setAttribute('role', 'slider');
  mini.setAttribute('aria-label', '迷你进度条');
  mini.setAttribute('aria-valuemin', '0');
  // The visible track stays thin; the transparent area above it is a touch target.
  mini.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:24px;background:linear-gradient(to top,#ffffff40 3px,transparent 3px);touch-action:none;cursor:pointer;z-index:90';
  const fill = document.createElement('div');
  fill.style.cssText = 'position:absolute;left:0;bottom:0;height:3px;width:0;background:var(--art-theme,#22c55e);pointer-events:none';
  mini.appendChild(fill);
  root.append(hud, mini);
  let enabled = art.setting.find('crayonMiniProgress')?.switch ?? miniPreference(art.option.miniProgressBar);
  let displayed = art.currentTime;
  let dragging: { kind: 'touch'; id: number; bar: HTMLElement } | { kind: 'mouse'; bar: HTMLElement } | undefined;
  let suppressClickUntil = 0;
  const scrubbing = () => root.dataset.crayonScrubbing === 'true';
  const miniScrubbing = () => root.dataset.crayonScrubbingMini === 'true';
  const render = () => {
    const valid = seekable(art);
    if (miniScrubbing() && !art.controls.show) root.classList.remove('art-hover');
    const current = valid ? clamp(displayed, art.duration) : 0;
    hud.textContent = `${formatDuration(current)} / ${formatDuration(art.duration)}`;
    hud.hidden = !valid || art.isLock || !(art.controls.show || scrubbing() || document.activeElement === mini);
    mini.hidden = !valid || !enabled || art.controls.show || scrubbing() && !miniScrubbing();
    fill.style.width = `${valid ? current / art.duration * 100 : 0}%`;
    fill.style.height = miniScrubbing() ? '5px' : '3px';
    mini.tabIndex = mini.hidden || art.isLock ? -1 : 0;
    mini.style.setProperty('cursor', art.isLock ? 'not-allowed' : 'pointer', 'important');
    mini.setAttribute('aria-disabled', String(!valid || art.isLock));
    mini.setAttribute('aria-valuemax', String(valid ? art.duration : 0));
    mini.setAttribute('aria-valuenow', String(current));
    mini.setAttribute('aria-valuetext', hud.textContent);
    if (notice) notice.style.top = hud.hidden ? noticeTop : '48px';
    if (progress && valid) {
      progress.setAttribute('aria-valuemax', String(art.duration));
      progress.setAttribute('aria-valuenow', String(current));
      progress.setAttribute('aria-valuetext', hud.textContent);
    }
  };
  const sync = () => { displayed = art.currentTime; render(); };
  const bar = (type: string, ratio: number) => {
    if (type === 'played' && Number.isFinite(ratio)) {
      displayed = seekable(art) ? clamp(ratio, 1) * art.duration : 0;
      render();
    }
  };
  const seek = () => {
    sync();
    if (seekable(art)) art.emit('setBar', 'played', clamp(art.currentTime / art.duration, 1));
  };
  const control = (visible: boolean) => {
    if (scrubbing()) {
      if (visible && miniScrubbing()) { art.controls.show = false; return; }
      if (!visible && !miniScrubbing()) { art.controls.show = true; return; }
    }
    render();
  };
  const preference = (event: Event) => {
    enabled = (event as CustomEvent<boolean>).detail;
    if (!enabled && dragging?.bar === mini) finish();
    render();
  };
  const stop = (event: Event) => {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  };
  const position = (point: { clientX: number; clientY: number }, target = dragging?.bar) => {
    if (!target || !seekable(art)) return;
    const rect = target.getBoundingClientRect();
    const size = art.isRotate ? rect.height : rect.width;
    if (size <= 0) return;
    const offset = art.isRotate ? point.clientY - rect.top : point.clientX - rect.left;
    seekAndSync(art, clamp(offset / size, 1) * art.duration);
  };
  const finish = () => {
    if (!dragging) return;
    dragging = undefined;
    suppressClickUntil = Date.now() + 800;
    setScrubbing(art, false);
  };
  const touchStart = (event: TouchEvent) => {
    const target = event.currentTarget as HTMLElement;
    if (target === mini && mini.hidden) return;
    if (art.isLock || !seekable(art) || event.touches.length !== 1) { finish(); stop(event); return; }
    stop(event);
    dragging = { kind: 'touch', id: event.touches[0].identifier, bar: target };
    setScrubbing(art, true, target === mini);
    position(event.touches[0]);
  };
  const touchMove = (event: TouchEvent) => {
    if (dragging?.kind !== 'touch') return;
    stop(event);
    if (event.touches.length !== 1 || event.touches[0].identifier !== dragging.id || art.isLock) { finish(); return; }
    position(event.touches[0]);
  };
  const touchEnd = (event: TouchEvent) => {
    if (dragging?.kind !== 'touch') return;
    const id = dragging.id;
    const point = Array.from(event.changedTouches).find(touch => touch.identifier === id);
    if (!point) return;
    stop(event);
    if (!art.isLock) position(point);
    finish();
  };
  const mouseStart = (event: MouseEvent) => {
    if (event.button !== 0 || art.isLock || !seekable(art)) return;
    if (event.currentTarget === mini && mini.hidden) return;
    stop(event);
    const target = event.currentTarget as HTMLElement;
    dragging = { kind: 'mouse', bar: target };
    setScrubbing(art, true, target === mini);
    position(event);
  };
  const mouseMove = (event: MouseEvent) => {
    if (dragging?.kind !== 'mouse') return;
    stop(event);
    if (art.isLock) { finish(); return; }
    position(event);
  };
  const mouseEnd = (event: MouseEvent) => {
    if (dragging?.kind !== 'mouse') return;
    stop(event);
    if (!art.isLock) position(event);
    finish();
  };
  const click = (event: MouseEvent) => {
    if (event.currentTarget === mini && mini.hidden) return;
    if (Date.now() < suppressClickUntil || art.isLock) { stop(event); return; }
    stop(event); position(event, event.currentTarget as HTMLElement);
  };
  const key = (event: KeyboardEvent) => {
    if (event.currentTarget === mini && mini.hidden) return;
    if (art.isLock || !seekable(art)) return;
    const targets: Record<string, number> = { ArrowLeft: art.currentTime - 5, ArrowRight: art.currentTime + 5, Home: 0, End: art.duration };
    if (!(event.key in targets)) return;
    stop(event);
    if (event.currentTarget !== mini) art.controls.show = true;
    seekAndSync(art, targets[event.key]);
  };
  // Stop ArtPlayer's desktop hover/move handlers from revealing the full bar
  // before a click/drag on the mini track has even started.
  const miniHover = (event: MouseEvent) => {
    if (mini.hidden || art.controls.show) return;
    const rect = mini.getBoundingClientRect();
    if (mini.contains(event.target as Node) || event.type === 'mouseenter' &&
      event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
      event.stopImmediatePropagation();
      root.classList.remove('art-hover');
    }
  };
  const reset = () => { finish(); displayed = 0; render(); art.emit('setBar', 'played', 0); };
  const visibility = () => { if (document.hidden) finish(); };
  const oldTouchAction = progress?.style.touchAction;
  const attributes = ['role', 'tabindex', 'aria-label', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext'];
  const previous = attributes.map(name => progress?.getAttribute(name));
  if (progress) {
    progress.style.touchAction = 'none';
    progress.setAttribute('role', 'slider');
    progress.setAttribute('tabindex', '0');
    progress.setAttribute('aria-label', '播放进度条');
    progress.setAttribute('aria-valuemin', '0');
  }
  const bars = [progress, mini].filter((bar): bar is HTMLDivElement => !!bar);
  bars.forEach(bar => {
    bar.addEventListener('touchstart', touchStart, { capture: true, passive: false });
    bar.addEventListener('mousedown', mouseStart, true);
    bar.addEventListener('click', click, true);
    bar.addEventListener('keydown', key, true);
  });
  mini.addEventListener('focus', render);
  mini.addEventListener('blur', render);
  root.addEventListener('mouseenter', miniHover, true);
  root.addEventListener('mousemove', miniHover, true);
  window.addEventListener('touchmove', touchMove, { capture: true, passive: false });
  window.addEventListener('touchend', touchEnd, { capture: true, passive: false });
  window.addEventListener('touchcancel', finish, true);
  window.addEventListener('mousemove', mouseMove, true);
  window.addEventListener('mouseup', mouseEnd, true);
  window.addEventListener('blur', finish);
  document.addEventListener('visibilitychange', visibility);
  root.addEventListener(SCRUB_EVENT, render);
  root.addEventListener(MINI_EVENT, preference);
  art.on('control', control);
  art.on('setBar', bar);
  art.on('seek', seek);
  art.on('lock', finish);
  art.on('lock', render);
  art.video.addEventListener('loadstart', reset);
  art.on('video:emptied', reset);
  const timeEvents = ['video:timeupdate', 'video:loadedmetadata', 'video:durationchange'] as const;
  timeEvents.forEach(event => art.on(event, sync));
  render();
  return () => {
    finish(); hud.remove(); mini.remove();
    if (notice) notice.style.top = noticeTop;
    if (progress) {
      progress.style.touchAction = oldTouchAction || '';
      attributes.forEach((name, index) => {
        const old = previous[index];
        if (old == null) progress.removeAttribute(name); else progress.setAttribute(name, old);
      });
    }
    bars.forEach(bar => {
      bar.removeEventListener('touchstart', touchStart, true);
      bar.removeEventListener('mousedown', mouseStart, true);
      bar.removeEventListener('click', click, true);
      bar.removeEventListener('keydown', key, true);
    });
    mini.removeEventListener('focus', render);
    mini.removeEventListener('blur', render);
    root.removeEventListener('mouseenter', miniHover, true);
    root.removeEventListener('mousemove', miniHover, true);
    window.removeEventListener('touchmove', touchMove, true);
    window.removeEventListener('touchend', touchEnd, true);
    window.removeEventListener('touchcancel', finish, true);
    window.removeEventListener('mousemove', mouseMove, true);
    window.removeEventListener('mouseup', mouseEnd, true);
    window.removeEventListener('blur', finish);
    document.removeEventListener('visibilitychange', visibility);
    root.removeEventListener(SCRUB_EVENT, render);
    root.removeEventListener(MINI_EVENT, preference);
    art.off('control', control);
    art.off('setBar', bar);
    art.off('seek', seek);
    art.off('lock', finish);
    art.off('lock', render);
    art.video.removeEventListener('loadstart', reset);
    art.off('video:emptied', reset);
    timeEvents.forEach(event => art.off(event, sync));
  };
}
