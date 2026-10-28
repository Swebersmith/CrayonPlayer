import type Artplayer from 'artplayer';

/** Transient menu; an unpainted edge target also works above cross-origin players. */
export function attachLibraryMenu(art: Artplayer, host: HTMLElement, bar: HTMLElement, wake: HTMLButtonElement, panel: HTMLElement) {
  const root = art.template.$player;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false, keyboard = false;
  let touchUntil = 0, menuAtTouch = false;
  let motion: Animation | undefined;
  let hiding = false;
  let pressed: number | undefined;
  const animate = typeof bar.animate === 'function' && !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const hide = () => {
    clearTimeout(timer);
    wake.setAttribute('aria-expanded', 'false');
    if (hiding || bar.hidden) return;
    bar.setAttribute('inert', '');
    if (!animate || disposed) { motion?.cancel(); bar.hidden = true; return; }
    const opacity = getComputedStyle(bar).opacity;
    hiding = true; motion?.cancel();
    const animation = bar.animate([{opacity,translate:'0 0'},{opacity:0,translate:'0 -6px'}],{duration:180,easing:'cubic-bezier(.22,.8,.25,1)',fill:'both'});
    motion = animation;
    void animation.finished.catch(()=>undefined).then(()=>{ if(motion===animation){bar.hidden=true;animation.cancel();motion=undefined;hiding=false;} });
  };
  const show = (fromKeyboard = false) => {
    if (disposed || !panel.hidden || art.isLock) return;
    keyboard = fromKeyboard;
    const entering = bar.hidden || hiding;
    hiding = false;
    if (entering) { motion?.cancel(); motion = undefined; }
    bar.removeAttribute('inert');
    bar.hidden = false;
    if (entering && animate) motion = bar.animate([{opacity:0,translate:'0 -8px'},{opacity:1,translate:'0 0'}],{duration:280,easing:'cubic-bezier(.22,.8,.25,1)'});
    wake.setAttribute('aria-expanded', 'true');
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (keyboard && (bar.contains(document.activeElement) || document.activeElement === wake)) return;
      hide();
    }, 2500);
  };
  const move = (event: Event) => {
    if ((event as PointerEvent).pointerType === 'touch') return;
    show();
  };
  const leave = (event?: Event) => {
    // Touch pointers leave on every finger lift, before the synthetic click.
    if ((event as PointerEvent | undefined)?.pointerType === 'touch') return;
    if (!(keyboard && (bar.contains(document.activeElement) || document.activeElement === wake))) hide();
  };
  const pointer = (event: PointerEvent) => {
    keyboard = false;
    if (!bar.hidden && bar.contains(event.target as Node)) { pressed = event.pointerId; clearTimeout(timer); }
  };
  const release = (event: PointerEvent) => {
    if (pressed === undefined || event.pointerId !== pressed) return;
    pressed = undefined;
    if (!bar.hidden) show();
  };
  const touch = (event: TouchEvent) => {
    if (event.target !== art.video) return;
    touchUntil = Date.now() + 1000;
    menuAtTouch = !bar.hidden;
  };
  const controls = (visible: boolean) => {
    if (touchUntil > Date.now()) {
      touchUntil = 0;
      if (menuAtTouch) hide(); else show();
    } else if (visible) show();
    // The toolbar has its own idle timer. A native controls timeout must not
    // swallow an unrelated menu tap that happened just before it.
  };
  const focus = (event: FocusEvent) => {
    if (event.target === wake) show(true);
    else if (bar.contains(event.target as Node)) show(keyboard);
  };
  const focusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (disposed || !keyboard || next && (bar.contains(next) || next === wake || panel.contains(next))) return;
    keyboard = false;
    hide();
  };
  const click = () => { show(); };
  const key = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (!panel.hidden || target.closest('input,select,textarea,[contenteditable=true]')) return;
    if (event.key === 'Tab' && host.contains(target)) { keyboard = true; show(true); }
    if (event.key.toLowerCase() === 'm' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); event.stopPropagation();
      show(true); bar.querySelector<HTMLButtonElement>('button')?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); hide();
    }
  };
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerenter', move);
  root.addEventListener('pointerleave', leave);
  root.addEventListener('pointerdown', pointer, true);
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
  root.addEventListener('keydown', key, true);
  window.addEventListener('touchstart', touch, { capture: true, passive: true });
  host.addEventListener('focusin', focus);
  host.addEventListener('focusout', focusOut);
  art.on('control', controls);
  art.on('click', click);
  art.on('play', hide);
  show();
  return {
    show, hide,
    destroy() {
      disposed = true; hiding = false; hide(); motion?.cancel();
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerenter', move);
      root.removeEventListener('pointerleave', leave);
      root.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
      root.removeEventListener('keydown', key, true);
      window.removeEventListener('touchstart', touch, true);
      host.removeEventListener('focusin', focus);
      host.removeEventListener('focusout', focusOut);
      art.off('control', controls); art.off('click', click); art.off('play', hide);
    },
  };
}
