import type Artplayer from 'artplayer';
import { attachControlPanel } from './control-panel';
import type { PlaybackSource } from './source-selector';

export interface PlaybackEpisode {
  number: number;
  title: string;
  key?: string;
  episodeRef?: { id: string; line: string; lineName?: string; episode: string; title: string };
}
export interface EpisodePlayback {
  url: string;
  type?: string;
  title?: string;
  storageKey?: string;
  sources?: PlaybackSource[];
  episodes?: PlaybackEpisode[];
  episodeNumber?: number;
  episodeKey?: string;
}

export function attachEpisodeSelector(art: Artplayer, episodes: PlaybackEpisode[], current: number | undefined, onSelect: (episode: PlaybackEpisode) => Promise<EpisodePlayback>, currentKey?: string) {
  const identity = (episode: PlaybackEpisode) => episode.key || String(episode.number);
  const validEpisodes = (items: PlaybackEpisode[]) => [...new Map(items.filter(episode => Number.isSafeInteger(episode?.number) && episode.number > 0 && typeof episode.title === 'string').map(episode => [identity(episode), episode])).values()].sort((a, b) => a.number - b.number);
  let list = validEpisodes(episodes);
  if (!list.length) return () => {};
  let selected = currentKey || identity(list.find(episode => episode.number === current) || list[0]);
  let page = Math.max(0, Math.floor(list.findIndex(episode => identity(episode) === selected) / 100));
  let busy = false;
  let disposed = false;
  const root = document.createElement('div'); root.dataset.crayonEpisodes = '';
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.textContent = '选集';
  trigger.setAttribute('aria-label', '选择剧集'); trigger.setAttribute('aria-haspopup', 'dialog');
  const panel = document.createElement('section'); panel.dataset.crayonEpisodePanel = '';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '选集');
  const pages = document.createElement('div'); pages.dataset.crayonEpisodePages = '';
  const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '上一页';
  const range = document.createElement('span'); range.setAttribute('aria-live', 'polite');
  const next = document.createElement('button'); next.type = 'button'; next.textContent = '下一页';
  pages.append(previous, range, next);
  const grid = document.createElement('div'); grid.dataset.crayonEpisodeGrid = '';
  grid.setAttribute('role', 'menu'); grid.setAttribute('aria-label', '剧集列表');
  const status = document.createElement('p'); status.dataset.crayonEpisodeStatus = ''; status.setAttribute('role', 'status');
  panel.append(pages, grid, status);
  const controls = attachControlPanel(art, { name: 'crayonEpisodes', position: 'left', root, trigger, panel });
  const render = () => {
    const offset = page * 100;
    panel.dataset.crayonNamedEpisodes = String(list.some(episode => episode.title.length > 8));
    pages.hidden = list.length <= 100;
    range.textContent = (offset + 1) + '–' + Math.min(offset + 100, list.length) + ' / ' + list.length;
    previous.disabled = busy || page === 0;
    next.disabled = busy || offset + 100 >= list.length;
    trigger.title = list.find(episode => identity(episode) === selected)?.title || '选择剧集';
    panel.setAttribute('aria-busy', String(busy));
    grid.replaceChildren(...list.slice(offset, offset + 100).map(episode => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = episode.title;
      button.dataset.episodeNumber = String(episode.number); button.disabled = busy;
      button.dataset.episodeKey = identity(episode);
      button.setAttribute('role', 'menuitemradio'); button.setAttribute('aria-checked', String(identity(episode) === selected));
      return button;
    }));
  };
  const focus = () => (grid.querySelector<HTMLElement>('[aria-checked=true]') || grid.querySelector<HTMLElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
  const changePage = (offset: number) => { page += offset; render(); grid.scrollTop = 0; focus(); };
  previous.addEventListener('click', () => changePage(-1));
  next.addEventListener('click', () => changePage(1));
  const select = async (event: Event) => {
    event.stopPropagation();
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-episode-number]');
    const episode = list.find(episode => identity(episode) === button?.dataset.episodeKey);
    if (!episode || busy) return;
    if (identity(episode) === selected) { controls.close(); trigger.focus(); return; }
    busy = true; status.textContent = '正在解析' + episode.title + '…'; render();
    try {
      const result = await onSelect(episode);
      if (disposed) return;
      selected = result.episodeKey || (result.episodeNumber !== undefined && result.episodeNumber !== episode.number ? String(result.episodeNumber) : identity(episode));
      const updated = validEpisodes(result.episodes || []);
      if (updated.length) list = updated;
      page = Math.max(0, Math.floor(list.findIndex(item => identity(item) === selected) / 100));
      status.textContent = ''; controls.close(); trigger.focus();
    } catch (error) {
      if (disposed) return;
      status.textContent = error instanceof Error ? error.message : '选集失败，请重试';
      art.notice.show = status.textContent;
    } finally { if (!disposed) { busy = false; render(); } }
  };
  const key = (event: KeyboardEvent) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const buttons = Array.from(grid.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    buttons[(index + direction + buttons.length) % buttons.length].focus();
  };
  grid.addEventListener('click', select); grid.addEventListener('keydown', key);
  render();
  const destroy = () => {
    disposed = true; controls.destroy(); grid.removeEventListener('click', select); grid.removeEventListener('keydown', key); art.off('destroy', destroy);
  };
  art.on('destroy', destroy);
  return destroy;
}
