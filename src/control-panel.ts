import type Artplayer from 'artplayer';
import { announcePanel, cancelPanelMotion, PANEL_OPEN } from './player-theme';

interface ControlPanelOptions {
  name: string;
  position: 'left' | 'right';
  root: HTMLElement;
  trigger: HTMLButtonElement;
  panel: HTMLElement;
  /** Visible drawer heading, for example `换源` or `选集`. */
  title: string;
}

const timing = { duration: 360, easing: 'cubic-bezier(.22,.8,.25,1)' };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Control menus are full-height side drawers. The trigger stays in the control
 * row; the drawer and its mask live on the player root so they can cover the
 * complete picture without inheriting the control row's stacking context.
 */
export function attachControlPanel(art: Artplayer, options: ControlPanelOptions) {
  const { root, trigger, panel, position, title } = options;
  const player = art.template.$player;
  root.dataset.crayonControl = '';
  panel.dataset.crayonControlPanel = '';
  panel.dataset.crayonSide = position;
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  const previousLabel = panel.getAttribute('aria-label');
  if (!previousLabel) panel.setAttribute('aria-label', title);

  const head = document.createElement('header');
  head.dataset.crayonPanelHead = '';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.dataset.crayonPanelClose = '';
  closeButton.setAttribute('aria-label', '关闭' + title);
  closeButton.textContent = '关闭';
  head.append(heading, closeButton);

  const mask = document.createElement('div');
  mask.dataset.crayonPanelMask = '';
  mask.setAttribute('aria-hidden', 'true');
  mask.hidden = true;

  panel.prepend(head);
  trigger.setAttribute('aria-expanded', 'false');
  root.append(trigger);
  // Portals keep the drawer above the scrim and every player HUD.
  player.append(mask, panel);
  art.controls.add({ name: options.name, position, index: 15, html: root });

  let disposed = false;
  let animations: Animation[] = [];
  let motion = 0;
  let openState = false;

  const stopMotion = () => {
    motion += 1;
    animations.forEach(animation => { try { animation.cancel(); } catch { /* already cancelled */ } });
    animations = [];
  };
  const setMaskVisible = (visible: boolean) => { mask.hidden = !visible; };
  const focusTarget = () => panel.querySelector<HTMLElement>('[role=menuitemradio][aria-checked=true]')
    || panel.querySelector<HTMLElement>('[role=menuitemradio]:not(:disabled)')
    || closeButton;
  const close = (focusTrigger = false) => {
    if (disposed) return;
    if (!openState) {
      setMaskVisible(false);
      if (focusTrigger) trigger.focus();
      return;
    }
    openState = false;
    trigger.setAttribute('aria-expanded', 'false');
    stopMotion();
    const focus = () => { if (focusTrigger && !disposed) trigger.focus(); };
    if (!panel.animate || reduced()) {
      panel.hidden = true;
      setMaskVisible(false);
      focus();
      return;
    }
    const current = motion;
    const offset = position === 'left' ? '-100%' : '100%';
    animations.push(panel.animate([
      { transform: 'translateX(0)', opacity: 1 },
      { transform: `translateX(${offset})`, opacity: .35 },
    ], { ...timing, duration: 220, fill: 'both' }));
    animations.push(mask.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, duration: 200, fill: 'both' }));
    void Promise.all(animations.map(animation => animation.finished.catch(() => undefined))).then(() => {
      if (motion !== current || disposed || openState) return;
      animations.forEach(animation => { try { animation.cancel(); } catch { /* already cancelled */ } });
      animations = [];
      panel.hidden = true;
      setMaskVisible(false);
      focus();
    });
  };
  const open = () => {
    if (disposed || art.isLock) return;
    if (openState) return;
    openState = true;
    art.controls.show = true;
    announcePanel(art, panel);
    stopMotion();
    panel.hidden = false;
    setMaskVisible(true);
    trigger.setAttribute('aria-expanded', 'true');
    if (!panel.animate || reduced()) {
      focusTarget()?.focus({ preventScroll: true });
      return;
    }
    const current = motion;
    const offset = position === 'left' ? '-100%' : '100%';
    animations.push(panel.animate([
      { transform: `translateX(${offset})`, opacity: .55 },
      { transform: 'translateX(0)', opacity: 1 },
    ], { ...timing, fill: 'both' }));
    animations.push(mask.animate([{ opacity: 0 }, { opacity: 1 }], { ...timing, duration: 220, fill: 'both' }));
    const selected = focusTarget();
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView?.({ block: 'nearest' });
    void Promise.all(animations.map(animation => animation.finished.catch(() => undefined))).then(() => {
      if (motion !== current || disposed || !openState) return;
      animations.forEach(animation => { try { animation.cancel(); } catch { /* already cancelled */ } });
      animations = [];
    });
  };
  const toggle = (event: Event) => {
    event.stopPropagation();
    if (openState) close();
    else open();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (!openState) return;
      event.preventDefault(); event.stopPropagation(); close(true); return;
    }
    if (event.key !== 'Tab' || !openState) return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])'))
      .filter(element => !element.closest('[hidden]'));
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
      event.preventDefault(); first.focus();
    }
  };
  const outside = (event: Event) => {
    if (!openState) return;
    const target = event.target as Element;
    if (panel.contains(target) || root.contains(target)) return;
    if (target.closest?.('[data-crayon-panel-mask]')) return;
    close();
  };
  const otherPanel = (event: Event) => {
    if (openState && (event as CustomEvent).detail !== panel) close();
  };
  const closeClick = (event: Event) => { event.stopPropagation(); close(true); };
  const maskClick = (event: Event) => { event.stopPropagation(); close(true); };
  trigger.addEventListener('click', toggle);
  closeButton.addEventListener('click', closeClick);
  mask.addEventListener('click', maskClick);
  root.addEventListener('keydown', key);
  panel.addEventListener('keydown', key);
  document.addEventListener('pointerdown', outside);
  player.addEventListener(PANEL_OPEN, otherPanel);
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    openState = false;
    stopMotion();
    trigger.removeEventListener('click', toggle);
    closeButton.removeEventListener('click', closeClick);
    mask.removeEventListener('click', maskClick);
    root.removeEventListener('keydown', key);
    panel.removeEventListener('keydown', key);
    document.removeEventListener('pointerdown', outside);
    player.removeEventListener(PANEL_OPEN, otherPanel);
    art.off('destroy', destroy);
    art.controls.remove(options.name);
    cancelPanelMotion(panel);
    panel.remove();
    mask.remove();
    panel.hidden = true;
    if (previousLabel) panel.setAttribute('aria-label', previousLabel);
    else panel.removeAttribute('aria-label');
    delete panel.dataset.crayonControlPanel;
    delete panel.dataset.crayonSide;
  };
  art.on('destroy', destroy);
  return { open, close, destroy };
}
