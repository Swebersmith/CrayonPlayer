import type Artplayer from 'artplayer';

/** Transient menu; an unpainted edge target also works above cross-origin players. */
export function attachLibraryMenu(art: Artplayer, host: HTMLElement, bar: HTMLElement, wake: HTMLButtonElement, panel: HTMLElement) {
  const root = art.template.$player;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false, keyboard = false;
  let touchUntil = 0, menuAtTouch = false;
  const hide = () => {
    clearTimeout(timer);
    bar.hidden = true;
    wake.setAttribute('aria-expanded', 'false');
  };
  const show = (fromKeyboard = false) => {
    if (disposed || !panel.hidden || art.isLock) return;
    keyboard = fromKeyboard;
    bar.hidden = false;
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
  const leave = () => { if (!(keyboard && bar.contains(document.activeElement))) hide(); };
  const pointer = () => { keyboard = false; };
  const touch = (event: TouchEvent) => {
    if (event.target !== art.video) return;
    touchUntil = Date.now() + 1000;
    menuAtTouch = !bar.hidden;
  };
  const controls = (visible: boolean) => {
    if (touchUntil > Date.now()) {
      touchUntil = 0;
      if (menuAtTouch) hide(); else show();
    } else if (visible) show(); else leave();
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
      disposed = true; hide();
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerenter', move);
      root.removeEventListener('pointerleave', leave);
      root.removeEventListener('pointerdown', pointer, true);
      root.removeEventListener('keydown', key, true);
      window.removeEventListener('touchstart', touch, true);
      host.removeEventListener('focusin', focus);
      host.removeEventListener('focusout', focusOut);
      art.off('control', controls); art.off('click', click); art.off('play', hide);
    },
  };
}
