import { ASPECT_FULLSCREEN_CHANGE, aspectFullscreenSetting, attachAspectFullscreen } from '../src/aspect-fullscreen';
import { fakeArt } from './helpers';

afterEach(() => { document.body.innerHTML = ''; localStorage.clear(); });

it('fills proportionally only while fullscreen and restores the normal frame on exit', () => {
  const art = fakeArt();
  const root = art.template.$player;
  const dispose = attachAspectFullscreen(art);
  try {
    expect(root.dataset.crayonAspectFullscreen).toBe('false');
    root.dispatchEvent(new CustomEvent(ASPECT_FULLSCREEN_CHANGE, { detail: true }));
    expect(root.dataset.crayonAspectFullscreen).toBe('false');
    art.fullscreenWeb = true;
    art.emit('fullscreenWeb', true);
    expect(root.dataset.crayonAspectFullscreen).toBe('true');
    art.fullscreenWeb = false;
    art.emit('fullscreenWeb', false);
    expect(root.dataset.crayonAspectFullscreen).toBe('false');
    expect(root.querySelector('style[data-crayon-aspect-fullscreen-style]')!.textContent).toContain('object-fit:cover');
  } finally { dispose(); }
  expect(root.dataset.crayonAspectFullscreen).toBeUndefined();
  expect(root.querySelector('[data-crayon-aspect-fullscreen-style]')).toBeNull();
});

it('persists the aspect fullscreen preference from settings', () => {
  const art = fakeArt();
  const root = art.template.$player;
  const setting = aspectFullscreenSetting();
  expect(setting.name).toBe('crayonAspectFullscreen');
  expect(setting.switch).toBe(false);
  const changed = jest.fn();
  root.addEventListener(ASPECT_FULLSCREEN_CHANGE, changed);
  const next = setting.onSwitch!.call(art, { switch: false } as any, document.createElement('div'), new Event('click'));
  expect(next).toBe(true);
  expect(localStorage.getItem('crayon-player-aspect-fullscreen')).toBe('1');
  expect(changed).toHaveBeenCalledWith(expect.objectContaining({ detail: true }));
  expect(aspectFullscreenSetting().switch).toBe(true);
});
