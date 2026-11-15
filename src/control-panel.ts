import type Artplayer from 'artplayer';
import { announcePanel, cancelPanelMotion, morphPanel, PANEL_OPEN } from './player-theme';

interface ControlPanelOptions {
  name: string;
  position: 'left' | 'right';
  root: HTMLElement;
  trigger: HTMLButtonElement;
  panel: HTMLElement;
}

/** Control menus share settings appearance, placement and dismissal behavior. */
export function attachControlPanel(art: Artplayer, options: ControlPanelOptions) {
  const { root, trigger, panel, position } = options;
  const player = art.template.$player;
  root.dataset.crayonControl = '';
  panel.dataset.crayonControlPanel = '';
  panel.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  root.append(trigger, panel);
  art.controls.add({ name: options.name, position, index: 15, html: root });
  let disposed = false;
  const place = () => {
    let left = 0;
    let element: HTMLElement | null = root;
    while (element && element !== player) { left += element.offsetLeft; element = element.offsetParent as HTMLElement | null; }
    panel.style.maxWidth = Math.max(0, player.clientWidth - 24) + 'px';
    if (position === 'left') panel.style.left = Math.round(12 - left) + 'px';
    else panel.style.right = Math.round(left + root.offsetWidth - player.clientWidth + 12) + 'px';
  };
  const close = () => {
    trigger.setAttribute('aria-expanded', 'false');
    cancelPanelMotion(panel);
    panel.hidden = true;
  };
  const open = () => {
    if (disposed || art.isLock) return;
    art.controls.show = true;
    announcePanel(art, panel);
    place();
    trigger.setAttribute('aria-expanded', 'true');
    void morphPanel(player, panel, trigger.getBoundingClientRect(), true);
    const selected = panel.querySelector<HTMLElement>('[aria-checked=true]') || panel.querySelector<HTMLElement>('button:not(:disabled)');
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView?.({ block: 'nearest' });
  };
  const click = (event: Event) => { event.stopPropagation(); if (trigger.getAttribute('aria-expanded') === 'true') close(); else open(); };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); trigger.focus(); }
    if (event.key === 'Tab') close();
  };
  const outside = (event: Event) => { if (!root.contains(event.target as Node)) close(); };
  const otherPanel = (event: Event) => { if ((event as CustomEvent).detail !== panel) close(); };
  const control = (visible: boolean) => { if (!visible) close(); };
  const resize = () => { if (trigger.getAttribute('aria-expanded') === 'true') { cancelPanelMotion(panel); place(); } };
  trigger.addEventListener('click', click);
  root.addEventListener('keydown', key);
  document.addEventListener('pointerdown', outside);
  player.addEventListener(PANEL_OPEN, otherPanel);
  art.on('control', control);
  art.on('resize', resize);
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    close();
    trigger.removeEventListener('click', click);
    root.removeEventListener('keydown', key);
    document.removeEventListener('pointerdown', outside);
    player.removeEventListener(PANEL_OPEN, otherPanel);
    art.off('control', control);
    art.off('resize', resize);
    art.off('destroy', destroy);
    art.controls.remove(options.name);
  };
  art.on('destroy', destroy);
  return { open, close, destroy };
}
