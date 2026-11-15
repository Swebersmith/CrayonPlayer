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

it('renders the ranked routes in bottom-right controls and switches without replacing the player', () => {
  const root = container.querySelector<HTMLElement>('[data-crayon-sources]')!;
  expect(root.closest('.art-controls-right')).not.toBeNull();
  const trigger = root.querySelector<HTMLButtonElement>('button')!;
  trigger.click();
  const menu = root.querySelector<HTMLElement>('[role=menu]')!;
  expect(menu.hidden).toBe(false);
  const choices = menu.querySelectorAll<HTMLButtonElement>('button');
  expect(choices[0].textContent).toBe(sources[0].name);
  expect(root.querySelector('img')).toBeNull();
  const video = art.video;
  video.currentTime = 42;
  Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
  choices[1].click();
  expect(art.video).toBe(video);
  expect(art.option.url).toBe(sources[1].url);
  expect(choices[1].getAttribute('aria-checked')).toBe('true');
  expect(menu.hidden).toBe(true);
  art.emit('video:canplay');
  expect(art.currentTime).toBe(42);
});
it('supports keyboard selection and closes when controls are hidden', () => {
  const root = container.querySelector<HTMLElement>('[data-crayon-sources]')!;
  const trigger = root.querySelector<HTMLButtonElement>('button')!;
  trigger.click();
  root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  expect(document.activeElement).toBe(root.querySelectorAll('[role=menuitemradio]')[1]);
  root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(root.querySelector<HTMLElement>('[role=menu]')!.hidden).toBe(true);
  expect(document.activeElement).toBe(trigger);
  trigger.click(); art.emit('control', false);
  expect(root.querySelector<HTMLElement>('[role=menu]')!.hidden).toBe(true);
});
