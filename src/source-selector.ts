import type Artplayer from 'artplayer';
import { attachControlPanel } from './control-panel';

export interface PlaybackSource { id: string; name: string; url: string; type?: string; available?: boolean; reason?: string }
const controlName = 'crayonSources';

export function validPlaybackSources(sources: PlaybackSource[]) {
  return sources.filter(source => {
    if (!source || typeof source.id !== 'string' || typeof source.name !== 'string' || typeof source.url !== 'string') return false;
    if (source.available === false) return true;
    try { const url = new URL(source.url, location.href); return /^https?:$/.test(url.protocol) && !url.username && !url.password; }
    catch { return false; }
  });
}

export function attachSourceSelector(art: Artplayer, sources: PlaybackSource[], onSelect: (source: PlaybackSource) => void) {
  const routes = validPlaybackSources(sources);
  if (!routes.length) return () => {};
  const root = document.createElement('div'); root.dataset.crayonSources = '';
  const trigger = document.createElement('button'); trigger.type = 'button';
  trigger.setAttribute('aria-label', '选择播放线路'); trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false');
  // The drawer is a dialog; the actual radio choices stay in a nested menu.
  const panel = document.createElement('section'); panel.dataset.crayonSourcePanel = ''; panel.setAttribute('aria-label', '换源');
  const menu = document.createElement('div'); menu.dataset.crayonSourceMenu = '';
  menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', '播放线路');
  panel.append(menu);
  const unavailableCount = routes.filter(route => route.available === false).length;
  if (unavailableCount) {
    const status = document.createElement('p'); status.dataset.crayonSourceStatus = ''; status.setAttribute('role', 'status');
    status.textContent = (routes.length - unavailableCount) + ' 条可播放 · ' + unavailableCount + ' 条暂不可用';
    menu.append(status);
  }
  let selected = routes.findIndex(route => route.available !== false && route.url === art.option.url);
  if (selected < 0) selected = routes.findIndex(route => route.available !== false);
  const buttons = routes.map((source, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitemradio'); button.dataset.sourceId = source.id;
    button.disabled = source.available === false;
    button.setAttribute('aria-disabled', String(button.disabled));
    button.textContent = source.name + (button.disabled ? ' · ' + (source.reason || '暂不可用') : '');
    button.title = button.textContent;
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (button.disabled) return;
      if (selected !== index) {
        try { onSelect(source); selected = index; update(); }
        catch { art.notice.show = '线路切换失败，请重试'; }
      }
      controls.close(); trigger.focus();
    });
    menu.append(button); return button;
  });
  function update() {
    const available = routes.filter(route => route.available !== false);
    trigger.textContent = '线路 ' + (available.indexOf(routes[selected]) + 1) + '/' + available.length;
    trigger.title = (routes[selected]?.name || '暂无可用线路') + (unavailableCount ? ' · ' + unavailableCount + ' 条暂不可用，点击查看原因' : '');
    buttons.forEach((button, index) => button.setAttribute('aria-checked', String(index === selected)));
  }
  const controls = attachControlPanel(art, { name: controlName, position: 'right', root, trigger, panel, title: '换源' });
  const key = (event: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key) || panel.hidden) return;
    event.preventDefault(); event.stopPropagation();
    const enabled = buttons.filter(button => !button.disabled);
    if (!enabled.length) return;
    const down = event.key === 'ArrowDown';
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const next = index < 0 ? (down ? 0 : enabled.length - 1) : (index + (down ? 1 : enabled.length - 1)) % enabled.length;
    enabled[next].focus();
  };
  root.addEventListener('keydown', key);
  menu.addEventListener('keydown', key);
  update();
  const cleanup = () => {
    root.removeEventListener('keydown', key);
    menu.removeEventListener('keydown', key);
    art.off('destroy', cleanup);
    controls.destroy();
  };
  art.on('destroy', cleanup);
  return cleanup;
}
