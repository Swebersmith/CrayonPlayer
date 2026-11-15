import type Artplayer from 'artplayer';

export interface PlaybackSource { id: string; name: string; url: string; type?: string }
const controlName = 'crayonSources';

export function attachSourceSelector(art: Artplayer, sources: PlaybackSource[], onSelect: (source: PlaybackSource) => void) {
  const routes = sources.filter(source => {
    if (!source || typeof source.id !== 'string' || typeof source.name !== 'string' || typeof source.url !== 'string') return false;
    try { const url = new URL(source.url, location.href); return /^https?:$/.test(url.protocol) && !url.username && !url.password; }
    catch { return false; }
  });
  if (!routes.length) return () => {};
  if (!document.getElementById('crayon-sources-style')) {
    const style = document.createElement('style'); style.id = 'crayon-sources-style';
    style.textContent = `[data-crayon-sources]{position:relative;font:inherit}[data-crayon-sources] button{font:inherit;color:inherit;cursor:pointer;border:0;background:transparent}[data-crayon-sources]>button{height:36px;min-width:60px;padding:0 8px;white-space:nowrap;font-size:12px}[data-crayon-sources] [role=menu]{position:absolute;right:0;bottom:44px;width:max-content;max-width:min(380px,calc(100vw - 28px));max-height:min(320px,50vh);overflow:auto;padding:6px;border:1px solid #ffffff24;border-radius:10px;background:#111a26ed;backdrop-filter:blur(18px);box-shadow:0 12px 35px #0005;z-index:160}[data-crayon-sources] [role=menu][hidden]{display:none}[data-crayon-sources] [role=menuitemradio]{display:block;width:100%;padding:11px 13px;min-height:40px;text-align:left;white-space:normal;overflow-wrap:anywhere;font-size:12px;line-height:1.6;border-radius:6px}[data-crayon-sources] [aria-checked=true]{color:#b5e7d8!important;background:#ffffff14!important}[data-crayon-sources] button:hover{background:#ffffff0c}[data-crayon-sources] button:focus-visible{outline:2px solid #b5e7d8;outline-offset:-2px}`;
    document.head.append(style);
  }
  const root = document.createElement('div'); root.dataset.crayonSources = '';
  const trigger = document.createElement('button'); trigger.type = 'button';
  trigger.setAttribute('aria-label', '选择播放线路'); trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div'); menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', '播放线路'); menu.hidden = true;
  let selected = Math.max(0, routes.findIndex(route => route.url === art.option.url));
  const buttons = routes.map((source, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitemradio'); button.dataset.sourceId = source.id;
    button.textContent = source.name;
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (selected !== index) {
        try { onSelect(source); selected = index; update(); }
        catch { art.notice.show = '线路切换失败，请重试'; }
      }
      close(); trigger.focus();
    });
    menu.append(button); return button;
  });
  function update() {
    trigger.textContent = '线路 ' + (selected + 1) + '/' + routes.length;
    trigger.title = routes[selected].name;
    buttons.forEach((button, index) => button.setAttribute('aria-checked', String(index === selected)));
  }
  function close() { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }
  function open() {
    art.controls.show = true;
    const player = art.template.$player;
    menu.style.maxHeight = Math.max(60, player.clientHeight - 72) + 'px';
    menu.style.maxWidth = Math.max(130, player.clientWidth - 24) + 'px';
    let left = 0;
    let element: HTMLElement | null = root;
    while (element && element !== player) { left += element.offsetLeft; element = element.offsetParent as HTMLElement | null; }
    menu.style.right = Math.round(left + root.offsetWidth - player.clientWidth + 12) + 'px';
    menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); buttons[selected].focus();
  }
  trigger.addEventListener('click', event => { event.stopPropagation(); if (menu.hidden) open(); else close(); });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); trigger.focus(); }
    if (event.key === 'Tab') close();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      if (menu.hidden) { open(); return; }
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(index + (event.key === 'ArrowDown' ? 1 : routes.length - 1)) % routes.length].focus();
    }
  });
  const outside = (event: Event) => { if (!root.contains(event.target as Node)) close(); };
  const hide = (visible: boolean) => { if (!visible) close(); };
  root.append(trigger, menu); update();
  art.controls.add({ name: controlName, position: 'right', index: 15, html: root });
  document.addEventListener('pointerdown', outside);
  art.on('control', hide);
  const cleanup = () => { document.removeEventListener('pointerdown', outside); art.off('control', hide); };
  art.on('destroy', cleanup);
  return cleanup;
}
