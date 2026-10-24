import { attachResponsiveLayout, responsiveSettings } from '../src/responsive';
import { attachProgress, formatCompactDuration } from '../src/progress';
import { fakeArt } from './helpers';

it.each([[0,'0:00'],[59,'0:59'],[60,'1:00'],[1652,'27:32'],[4613,'1:16:53'],[Infinity,'0:00']])('formats compact mobile time %s', (value, expected) => {
  expect(formatCompactDuration(value as number)).toBe(expected);
});

it('tracks actual container size, updates the HUD on resize, and disconnects on destroy', () => {
  const art = fakeArt();
  const root = art.template.$player;
  let width = 360, height = 203;
  Object.defineProperty(root, 'clientWidth', { get: () => width });
  Object.defineProperty(root, 'clientHeight', { get: () => height });
  const previousObserver = global.ResizeObserver;
  let changed: () => void;
  const disconnect = jest.fn();
  global.ResizeObserver = jest.fn().mockImplementation(callback => {
    changed = callback;
    return { observe: jest.fn(), disconnect };
  });
  root.style.setProperty('--art-settings-max-height', '250px', 'important');
  const progress = attachProgress(art);
  const responsive = attachResponsiveLayout(art);
  try {
    expect(root.dataset.crayonCompact).toBe('true');
    expect(root.querySelector('[data-crayon-progress-time]')!.textContent).toBe('0:50 / 1:40');
    width = 900; height = 506; changed!();
    expect(root.dataset.crayonCompact).toBe('false');
    expect(root.querySelector('[data-crayon-progress-time]')!.textContent).toBe('50秒 / 1分钟40秒');
    width = 280; height = 158; art.emit('resize');
    expect(root.dataset.crayonTiny).toBe('true');
    expect(root.dataset.crayonShallow).toBe('true');
    expect(root.style.getPropertyValue('--crayon-player-height')).toBe('158px');
  } finally {
    responsive(); progress();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(root.dataset.crayonResponsive).toBeUndefined();
    expect(root.style.getPropertyValue('--art-settings-max-height')).toBe('250px');
    expect(root.style.getPropertyPriority('--art-settings-max-height')).toBe('important');
    global.ResizeObserver = previousObserver;
    document.body.innerHTML = '';
  }
});

it('keeps secondary actions available and handles unsupported or rejected picture-in-picture without throwing', async () => {
  const art = fakeArt();
  const settings = responsiveSettings({ container: art.template.$player, url: '', pip: true, fullscreenWeb: true });
  const web = settings.find(item => item.name === 'crayonCompactFullscreenWeb')!;
  web.onClick!.call(art, {} as any, document.createElement('div'), new Event('click'));
  expect(art.fullscreenWeb).toBe(true);
  const pip = settings.find(item => item.name === 'crayonCompactPip')!;
  const saved = Object.getOwnPropertyDescriptor(document, 'pictureInPictureEnabled');
  try {
    Object.defineProperty(document, 'pictureInPictureEnabled', { configurable: true, value: false });
    await pip.onClick!.call(art, {} as any, document.createElement('div'), new Event('click'));
    expect(art.notice.show).toContain('不支持画中画');
    Object.defineProperty(document, 'pictureInPictureEnabled', { configurable: true, value: true });
    art.video.requestPictureInPicture = jest.fn().mockRejectedValue(new Error('permission denied'));
    await pip.onClick!.call(art, {} as any, document.createElement('div'), new Event('click'));
    expect(art.notice.show).toContain('检查浏览器权限');
  } finally {
    if (saved) Object.defineProperty(document, 'pictureInPictureEnabled', saved);
    else delete (document as any).pictureInPictureEnabled;
    document.body.innerHTML = '';
  }
});

it('opens the cast button rather than a same-labelled tooltip wrapper from the tiny settings menu', () => {
  const art = fakeArt();
  const wrapper = document.createElement('div'); wrapper.setAttribute('aria-label', '投屏');
  const trigger = document.createElement('button'); trigger.setAttribute('aria-label', '投屏');
  const clicked = jest.fn(); trigger.addEventListener('click', clicked);
  wrapper.append(trigger); art.template.$player.append(wrapper);
  responsiveSettings({ container: art.template.$player, url: '' }).find(item => item.name === 'crayonCompactCast')!
    .onClick!.call(art, {} as any, document.createElement('div'), new Event('click'));
  expect(clicked).toHaveBeenCalledTimes(1);
  document.body.innerHTML = '';
});

it('recomputes an existing rotated webpage fullscreen layout on portrait/landscape changes', () => {
  const art = fakeArt();
  const root = art.template.$player;
  const oldWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  const oldHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  Object.defineProperty(art.video, 'videoWidth', { configurable: true, value: 1920 });
  Object.defineProperty(art.video, 'videoHeight', { configurable: true, value: 1080 });
  root.classList.add('art-auto-orientation');
  art.fullscreenWeb = true;
  const dispose = attachResponsiveLayout(art);
  try {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 844 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 });
    window.dispatchEvent(new Event('resize'));
    expect(art.isRotate).toBe(false);
    expect(root.classList.contains('art-auto-orientation')).toBe(false);
    expect(root.style.width).toBe('100%');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    window.dispatchEvent(new Event('resize'));
    expect(art.isRotate).toBe(true);
    expect(root.style.width).toBe('844px');
    expect(root.style.height).toBe('390px');
  } finally {
    dispose();
    Object.defineProperty(window, 'innerWidth', oldWidth!);
    Object.defineProperty(window, 'innerHeight', oldHeight!);
    document.body.innerHTML = '';
  }
});
