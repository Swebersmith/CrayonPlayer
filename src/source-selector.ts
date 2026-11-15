import type Artplayer from 'artplayer';
import { attachControlPanel } from './control-panel';

export interface PlaybackSource { id: string; name: string; url: string; type?: string }
const controlName = 'crayonSources';

export function attachSourceSelector(art: Artplayer, sources: PlaybackSource[], onSelect: (source: PlaybackSource) => void) {
  const routes = sources.filter(source => {
    if (!source || typeof source.id !== 'string' || typeof source.name !== 'string' || typeof source.url !== 'string') return false;
    try { const url = new URL(source.url, location.href); return /^https?:$/.test(url.protocol) && !url.username && !url.password; }
    catch { return false; }
  });
  if (!routes.length) return () => {};
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
      controls.close(); trigger.focus();
    });
    menu.append(button); return button;
  });
  function update() {
    trigger.textContent = '线路 ' + (selected + 1) + '/' + routes.length;
    trigger.title = routes[selected].name;
    buttons.forEach((button, index) => button.setAttribute('aria-checked', String(index === selected)));
  }
  const controls = attachControlPanel(art, { name: controlName, position: 'right', root, trigger, panel: menu });
  const key = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      if (menu.hidden) { controls.open(); return; }
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(index + (event.key === 'ArrowDown' ? 1 : routes.length - 1)) % routes.length].focus();
    }
  };
  root.addEventListener('keydown', key);
  update();
  const cleanup = () => { root.removeEventListener('keydown', key); art.off('destroy', cleanup); controls.destroy(); };
  art.on('destroy', cleanup);
  return cleanup;
}
