import type Artplayer from 'artplayer';

const timing = { duration: 360, easing: 'cubic-bezier(.22,.8,.25,1)' };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const transitions = new WeakMap<HTMLElement, { version: number; animations: Animation[]; ghost?: HTMLElement; target?: DOMRect }>();
export function animateContent(element: HTMLElement) {
  if (!element.animate || reduced()) return;
  element.animate([{ opacity: .25, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { ...timing, duration: 260 });
}

/** A single surface travels from the pressed button into the panel and back. */
export async function morphPanel(root: HTMLElement, panel: HTMLElement, origin: DOMRect | undefined, visible: boolean): Promise<boolean> {
  const previous = transitions.get(panel);
  const version = (previous?.version || 0) + 1;
  previous?.animations.forEach(animation => animation.cancel()); previous?.ghost?.remove();
  const state: { version: number; animations: Animation[]; ghost?: HTMLElement; target?: DOMRect } = { version, animations: [] };
  transitions.set(panel, state);
  if (visible) panel.hidden = false;
  if (!panel.animate || reduced()) { panel.hidden = !visible; return true; }
  const bounds = root.getBoundingClientRect(), currentTarget = panel.getBoundingClientRect();
  const target = currentTarget.width ? currentTarget : previous?.target || currentTarget;
  state.target = target;
  const from = origin && origin.width ? origin : new DOMRect(bounds.x + bounds.width / 2 - 28, bounds.y + 16, 56, 34);
  const pill = { left: `${Math.max(0, Math.min(bounds.width - from.width, from.x - bounds.x))}px`, top: `${Math.max(0, Math.min(bounds.height - from.height, from.y - bounds.y))}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: '16px', opacity: 1 };
  const sheet = { left: `${target.x - bounds.x}px`, top: `${target.y - bounds.y}px`, width: `${target.width}px`, height: `${target.height}px`, borderRadius: '20px', opacity: 1 };
  const ghost = document.createElement('div'); ghost.className = 'crayon-morph-surface'; root.append(ghost); state.ghost = ghost;
  state.animations.push(ghost.animate(visible ? [pill, sheet] : [sheet, pill], { ...timing, fill: 'both' }));
  state.animations.push(panel.animate(visible
    ? [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }]
    : [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-8px)' }], { ...timing, duration: visible ? 240 : 170, delay: visible ? 110 : 0, fill: 'both' }));
  await Promise.all(state.animations.map(animation => animation.finished.catch(() => undefined)));
  if (transitions.get(panel) !== state) return false;
  panel.hidden = !visible; state.animations.forEach(animation => animation.cancel()); ghost.remove(); state.ghost = undefined;
  return true;
}
export function cancelPanelMotion(panel: HTMLElement) {
  const state = transitions.get(panel); transitions.delete(panel);
  state?.animations.forEach(animation => animation.cancel()); state?.ghost?.remove();
}

export function attachPlayerTheme(art: Artplayer) {
  const root = art.template.$player;
  root.dataset.crayonTheme = '';
  const style = document.createElement('style');
  style.textContent = `
[data-crayon-theme]{--crayon-ink:#f3f6fa;--crayon-muted:#9daab9;--crayon-accent:#a1e6d0;--crayon-line:#ffffff14;--crayon-glass:linear-gradient(145deg,#1b2330f5,#111821f5);--crayon-ease:cubic-bezier(.22,.8,.25,1);font-family:Inter,"Segoe UI",system-ui,sans-serif}
[data-crayon-theme] button,[data-crayon-theme] [role=button],[data-crayon-theme] .art-control,[data-crayon-theme] .art-state,[data-crayon-theme] .art-selector-item,[data-crayon-theme] .art-setting-item{transition:background-color .22s var(--crayon-ease),border-color .22s var(--crayon-ease),color .22s var(--crayon-ease),box-shadow .22s var(--crayon-ease),scale .22s var(--crayon-ease)}
[data-crayon-theme] button:active,[data-crayon-theme] [role=button]:active,[data-crayon-theme] .art-control:active{scale:.95}
[data-crayon-theme] button:focus-visible,[data-crayon-theme] [role=button]:focus-visible{outline:2px solid var(--crayon-accent);outline-offset:3px}
[data-crayon-theme] .art-controls{gap:3px}[data-crayon-theme] .art-control{border-radius:10px;color:var(--crayon-ink)}
[data-crayon-theme] .art-control:hover{background:#ffffff0c;color:var(--crayon-accent)}
[data-crayon-theme] .art-control svg{transition:transform .3s var(--crayon-ease),opacity .22s var(--crayon-ease)}
[data-crayon-theme] .art-control:hover svg{transform:translateY(-1px)}
[data-crayon-theme] .art-settings{z-index:150;background:var(--crayon-glass);border:1px solid var(--crayon-line);border-radius:18px;box-shadow:0 16px 60px #0007;backdrop-filter:blur(24px);padding:6px}
[data-crayon-theme] .art-settings:not([hidden]){display:flex}
[data-crayon-theme] .art-setting-item{border-radius:10px;margin:2px 0}[data-crayon-theme] .art-setting-item:hover{background:#ffffff0a}
[data-crayon-theme] [data-crayon-cast-panel]{z-index:150!important;background:var(--crayon-glass)!important;border:1px solid var(--crayon-line);border-radius:18px!important;backdrop-filter:blur(24px)}
[data-crayon-theme] [data-crayon-cast-panel] button{border:1px solid var(--crayon-line)!important;border-radius:11px!important;background:#ffffff06!important;color:var(--crayon-ink)!important}
[data-crayon-theme] [data-crayon-cast-panel] button:hover{background:#ffffff12!important;border-color:#a1e6d04d!important}
[data-crayon-theme] input[type=range]{accent-color:var(--crayon-accent)}
.crayon-button-trail{position:absolute;top:0;left:0;z-index:210;border:1px solid #a1e6d04a;border-radius:11px;background:#a1e6d005;box-shadow:0 0 18px #a1e6d00b;pointer-events:none;opacity:0;transition:transform .28s var(--crayon-ease),width .28s var(--crayon-ease),height .28s var(--crayon-ease),opacity .16s ease}
.crayon-morph-surface{position:absolute;z-index:149;pointer-events:none;background:var(--crayon-glass);border:1px solid var(--crayon-line);box-shadow:0 24px 80px #0009;backdrop-filter:blur(24px)}
@media(prefers-reduced-motion:reduce){[data-crayon-theme] *,[data-crayon-theme] *::before,[data-crayon-theme] *::after{transition:none!important;animation:none!important}}
`;
  const trail = document.createElement('div'); trail.className = 'crayon-button-trail'; trail.setAttribute('aria-hidden','true');
  root.append(style, trail);
  const settings = root.querySelector<HTMLElement>('.art-settings');
  if (settings) settings.hidden = !art.setting.show;
  let active: HTMLElement | undefined;
  const target = (event: Event) => (event.target as HTMLElement)?.closest<HTMLElement>('button,[role=button],.art-control,.art-state,.art-selector-item,.art-setting-item');
  const hide = () => { trail.style.opacity = '0'; active = undefined; };
  const track = (event: Event) => {
    const button = target(event);
    if (!button || !root.contains(button) || button.matches(':disabled') || button.classList.contains('crayon-library-wake')) { hide(); return; }
    const rect = button.getBoundingClientRect(), bounds = root.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    active = button;
    Object.assign(trail.style,{width:`${rect.width}px`,height:`${rect.height}px`,transform:`translate(${rect.x-bounds.x}px,${rect.y-bounds.y}px)`,opacity:'1'});
  };
  const press = (event: Event) => {
    const button = target(event);
    if (!button?.animate || reduced() || button.matches(':disabled') || button.classList.contains('crayon-library-wake')) return;
    button.animate([{scale:'.96'},{scale:'1'}],{duration:230,easing:timing.easing});
  };
  const observer = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(() => { if(active && (!root.contains(active) || active.closest('[hidden]'))) hide(); });
  observer?.observe(root,{subtree:true,attributes:true,attributeFilter:['hidden','class'],childList:true});
  root.addEventListener('pointerover',track); root.addEventListener('focusin',track); root.addEventListener('pointerleave',hide); root.addEventListener('pointerdown',press,true);
  art.on('control',hide); art.on('play',hide);
  const setting = (visible: boolean) => {
    const panel = root.querySelector<HTMLElement>('.art-settings');
    if (panel) void morphPanel(root,panel,root.querySelector<HTMLElement>('.art-control-setting')?.getBoundingClientRect(),visible);
  };
  art.on('setting',setting);
  return () => { observer?.disconnect(); const panel=root.querySelector<HTMLElement>('.art-settings');if(panel)cancelPanelMotion(panel); root.removeEventListener('pointerover',track);root.removeEventListener('focusin',track);root.removeEventListener('pointerleave',hide);root.removeEventListener('pointerdown',press,true);art.off('control',hide);art.off('play',hide);art.off('setting',setting);trail.remove();style.remove();delete root.dataset.crayonTheme; };
}
