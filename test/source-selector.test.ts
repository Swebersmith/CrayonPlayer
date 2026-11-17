import { createCrayonPlayer } from '../src/index';

let container: HTMLDivElement;
let art: ReturnType<typeof createCrayonPlayer>;
const sources = [
  { id: 'a', name: '如意 · 1920×1080 · 120ms', url: 'https://cdn.example/1.mp4', type: 'mp4' },
  { id: 'b', name: '备用 <img src=x> · 1280×720 · 20ms', url: 'https://cdn.example/2.mp4', type: 'mp4' },
];
beforeEach(() => {
  localStorage.clear();
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  container = document.createElement('div'); document.body.append(container);
  art = createCrayonPlayer({ container, url: sources[0].url, sources, enhancements: { casting: false } });
});
afterEach(() => { art.destroy(); container.remove(); jest.restoreAllMocks(); localStorage.clear(); });

const root = () => container.querySelector<HTMLElement>('[data-crayon-sources]')!;
const trigger = () => root().querySelector<HTMLButtonElement>('button')!;
const panel = () => container.querySelector<HTMLElement>('[data-crayon-source-panel]')!;
const menu = () => panel().querySelector<HTMLElement>('[role=menu]')!;

it('opens a right side drawer over a shared mask and switches without replacing the player', () => {
  const control = root();
  expect(control.closest('.art-controls-right')).not.toBeNull();
  expect(panel().dataset.crayonSide).toBe('right');
  trigger().click();
  expect(panel().hidden).toBe(false);
  expect(menu().hidden).toBe(false);
  const mask = container.querySelector<HTMLElement>('[data-crayon-panel-mask]:not([hidden])')!;
  expect(mask).not.toBeNull();
  expect(getComputedStyle(mask).backgroundColor).toBe('rgba(0, 0, 0, 0.75)');
  expect(getComputedStyle(panel()).backgroundColor).toBe('rgba(0, 0, 0, 0.75)');
  const choices = menu().querySelectorAll<HTMLButtonElement>('[role=menuitemradio]');
  expect(choices[0].textContent).toBe(sources[0].name);
  expect(control.querySelector('img')).toBeNull();
  const video = art.video;
  video.currentTime = 42;
  Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
  choices[1].click();
  expect(art.video).toBe(video);
  expect(art.option.url).toBe(sources[1].url);
  expect(choices[1].getAttribute('aria-checked')).toBe('true');
  expect(panel().hidden).toBe(true);
  expect(container.querySelector('[data-crayon-panel-mask]:not([hidden])')).toBeNull();
  art.emit('video:canplay');
  expect(art.currentTime).toBe(42);
});
it('supports keyboard selection, close button and dismisses only from the mask or Escape', () => {
  trigger().click();
  root().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  expect(document.activeElement).toBe(menu().querySelectorAll('[role=menuitemradio]')[1]);
  root().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(panel().hidden).toBe(true);
  expect(document.activeElement).toBe(trigger());
  trigger().click();
  panel().querySelector<HTMLButtonElement>('[data-crayon-panel-close]')!.click();
  expect(panel().hidden).toBe(true);
  expect(document.activeElement).toBe(trigger());
  trigger().click(); art.emit('control', false);
  expect(panel().hidden).toBe(false);
  container.querySelector<HTMLElement>('[data-crayon-panel-mask]:not([hidden])')!.click();
  expect(panel().hidden).toBe(true);
});

it('shows unavailable sources with their failure reason and skips them during keyboard selection', () => {
  art.destroy();
  const failed = { id: 'ffzy', name: '非凡资源 · ffm3u8', url: '', available: false, reason: '片源返回 HTTP 403' };
  art = createCrayonPlayer({ container, url: sources[0].url, sources: [sources[0], failed, sources[1]], enhancements: { casting: false } });
  expect(trigger().textContent).toBe('线路 1/2');
  expect(trigger().title).toContain('1 条暂不可用');
  trigger().click();
  const buttons = menu().querySelectorAll<HTMLButtonElement>('[role=menuitemradio]');
  expect(buttons).toHaveLength(3);
  expect(buttons[1].disabled).toBe(true);
  expect(buttons[1].textContent).toContain('非凡资源 · ffm3u8 · 片源返回 HTTP 403');
  buttons[1].click();
  expect(art.option.url).toBe(sources[0].url);
  root().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  expect(document.activeElement).toBe(buttons[2]);
  buttons[2].click();
  expect(trigger().textContent).toBe('线路 2/2');
});

it('updates resolved connection routes in place and preserves source-time position', () => {
  const video = art.video;
  video.currentTime = 42;
  Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
  const browser = { ...sources[0], url: 'https://origin.example/direct.mp4', name: '如意 · 浏览器直连' };
  art.setSources([browser], browser.id);
  expect(art.video).toBe(video);
  expect(art.option.url).toBe(browser.url);
  art.emit('video:canplay');
  expect(art.currentTime).toBe(42);
  expect(container.querySelector('[data-crayon-source-panel] [role=menuitemradio]')!.textContent).toBe(browser.name);
  art.setSources([{ id: 'invalid', name: 'invalid', url: 'javascript:alert(1)' }], 'invalid');
  expect(art.option.url).toBe(browser.url);
});
