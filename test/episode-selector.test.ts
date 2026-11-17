import { createCrayonPlayer, EpisodePlayback } from '../src/index';

let container: HTMLDivElement;
let art: ReturnType<typeof createCrayonPlayer>;
const episodes = Array.from({ length: 205 }, (_, index) => ({ number: index + 1, title: '第' + (index + 1) + '集' }));
const original = { id: 'old', name: '当前线路', url: 'https://cdn.example/old.mp4', type: 'mp4' };
const replacement = { id: 'new', name: '新集线路', url: 'https://cdn.example/new.mp4', type: 'mp4' };
let select: jest.Mock<Promise<EpisodePlayback>>;
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const trigger = () => container.querySelector<HTMLButtonElement>('[data-crayon-episodes]>button')!;
const panel = () => container.querySelector<HTMLElement>('[data-crayon-episode-panel]')!;

beforeEach(() => {
  localStorage.clear();
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  select = jest.fn().mockResolvedValue({ url: replacement.url, type: 'mp4', sources: [replacement] });
  container = document.createElement('div'); document.body.append(container);
  art = createCrayonPlayer({ container, url: original.url, sources: [original], episodes, episodeNumber: 102, onEpisodeChange: select, enhancements: { casting: false } });
});
afterEach(() => { if (!art.isDestroy) art.destroy(); container.remove(); jest.restoreAllMocks(); localStorage.clear(); });

it('opens episodes as a left drawer at the current page and switches on the same player from the beginning', async () => {
  expect(trigger().closest('.art-controls-left')).not.toBeNull();
  expect(panel().dataset.crayonSide).toBe('left');
  trigger().click();
  expect(panel().hidden).toBe(false);
  expect(container.querySelector('[data-crayon-panel-mask]:not([hidden])')).not.toBeNull();
  expect(panel().querySelectorAll('[role=menuitemradio]')).toHaveLength(100);
  expect(document.activeElement?.textContent).toBe('第102集');
  const video = art.video;
  video.currentTime = 42;
  Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
  panel().querySelector<HTMLButtonElement>('[data-episode-number="103"]')!.click();
  expect(panel().getAttribute('aria-busy')).toBe('true');
  expect(panel().querySelector<HTMLButtonElement>('[data-episode-number="104"]')!.disabled).toBe(true);
  await flush();
  expect(select).toHaveBeenCalledTimes(1);
  expect(select).toHaveBeenCalledWith(episodes[102]);
  expect(art.video).toBe(video);
  expect(art.option.url).toBe(replacement.url);
  expect(panel().hidden).toBe(true);
  expect(panel().querySelector('[aria-checked=true]')?.textContent).toBe('第103集');
  expect(container.querySelectorAll('[data-crayon-sources]')).toHaveLength(1);
  expect(container.querySelector('[data-crayon-source-panel] [role=menuitemradio]')?.textContent).toBe('新集线路');
  art.emit('video:canplay');
  expect(art.currentTime).toBe(0);
});

it('keeps the current episode and media when selection fails and supports paging', async () => {
  select.mockRejectedValue(new Error('本集暂无可用线路'));
  trigger().click();
  panel().querySelector<HTMLButtonElement>('[data-episode-number="103"]')!.click();
  await flush();
  expect(art.option.url).toBe(original.url);
  expect(panel().querySelector('[aria-checked=true]')?.textContent).toBe('第102集');
  expect(panel().querySelector('[role=status]')?.textContent).toBe('本集暂无可用线路');
  expect(panel().getAttribute('aria-busy')).toBe('false');
  panel().querySelectorAll<HTMLButtonElement>('[data-crayon-episode-pages] button')[1].click();
  expect(panel().querySelectorAll('[role=menuitemradio]')).toHaveLength(5);
  expect(panel().querySelector('[data-episode-number="201"]')).not.toBeNull();
});

it('shares settings transparency and closes other menus when changing panels', () => {
  trigger().click();
  const source = container.querySelector<HTMLButtonElement>('[data-crayon-sources]>button')!;
  source.click();
  expect(panel().hidden).toBe(true);
  const sourcePanel = container.querySelector<HTMLElement>('[data-crayon-source-panel]')!;
  expect(sourcePanel.hidden).toBe(false);
  art.setting.show = true;
  expect(sourcePanel.hidden).toBe(true);
  trigger().click();
  expect(art.setting.show).toBe(false);
  for (const element of [panel(), sourcePanel, container.querySelector<HTMLElement>('.art-settings')!]) {
    expect(getComputedStyle(element).backgroundColor).toBe('rgba(0, 0, 0, 0.75)');
    expect(getComputedStyle(element).boxShadow).toBe('none');
  }
  panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(panel().hidden).toBe(true);
  expect(document.activeElement).toBe(trigger());
});

it('ignores a pending episode result after the player is destroyed', async () => {
  let finish!: (value: EpisodePlayback) => void;
  select.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  trigger().click();
  panel().querySelector<HTMLButtonElement>('[data-episode-number="103"]')!.click();
  art.destroy();
  finish({ url: replacement.url });
  await flush();
  expect(art.option.url).toBe(original.url);
});

it('keeps editions sharing a date separate and selects their exact catalogue references', async () => {
  art.destroy();
  const variants = [
    { number: 20261029, title: '20261029上', key: '20261029:upper', episodeRef: { id: 'ruyi:1', line: '0', episode: '2', title: '20261029上' } },
    { number: 20261029, title: '20261029下', key: '20261029:lower', episodeRef: { id: 'ruyi:1', line: '0', episode: '3', title: '20261029下' } },
    { number: 20261029, title: '20261029加更版', key: '20261029:extra', episodeRef: { id: 'bfzy:1', line: '0', episode: '4', title: '20261029加更版' } },
  ];
  select.mockResolvedValue({ url: replacement.url, type: 'mp4', episodes: variants, episodeNumber: 20261029, episodeKey: variants[0].key });
  art = createCrayonPlayer({ container, url: original.url, episodes: variants, episodeNumber: 20261029, episodeKey: variants[1].key, onEpisodeChange: select, enhancements: { casting: false } });
  trigger().click();
  expect(panel().querySelectorAll('[role=menuitemradio]')).toHaveLength(3);
  expect(panel().dataset.crayonNamedEpisodes).toBe('true');
  expect(panel().querySelector('[aria-checked=true]')?.textContent).toBe('20261029下');
  panel().querySelector<HTMLButtonElement>('[data-episode-key="20261029:upper"]')!.click();
  await flush();
  expect(select).toHaveBeenCalledWith(variants[0]);
  expect(panel().querySelector('[aria-checked=true]')?.textContent).toBe('20261029上');
  trigger().click();
  select.mockResolvedValue({ url: replacement.url, episodes: variants, episodeKey: variants[2].key });
  panel().querySelector<HTMLButtonElement>('[data-episode-key="20261029:extra"]')!.click();
  await flush();
  expect(select).toHaveBeenLastCalledWith(variants[2]);
  expect(panel().querySelector('[aria-checked=true]')?.textContent).toBe('20261029加更版');
});
