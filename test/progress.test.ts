import { attachGestures } from '../src/gestures';
import { attachProgress, formatDuration, miniProgressSetting } from '../src/progress';
import { fakeArt, touch } from './helpers';

it.each([
  [0, '0秒'], [59.9, '59秒'], [60, '1分钟0秒'], [3599, '59分钟59秒'],
  [3600, '1小时0分钟0秒'], [3661, '1小时1分钟1秒'], [-1, '0秒'], [Infinity, '0秒'],
])('formats %s in hours, minutes and seconds', (value, expected) => {
  expect(formatDuration(value as number)).toBe(expected);
});

let art: ReturnType<typeof fakeArt>;
let dispose: () => void;
const hud = () => art.template.$player.querySelector<HTMLElement>('[data-crayon-progress-time]')!;
const mini = () => art.template.$player.querySelector<HTMLElement>('[data-crayon-mini-progress]')!;
const control = (visible: boolean) => { art.controls.show = visible; art.emit('control', visible); };
beforeEach(() => { localStorage.clear(); art = fakeArt(); dispose = attachProgress(art); });
afterEach(() => { dispose(); document.body.innerHTML = ''; jest.restoreAllMocks(); });

it('updates the time and played bar synchronously on picture swipes without timeupdate', () => {
  const gestures = attachGestures(art);
  const bars = jest.fn(); art.on('setBar', bars);
  try {
    control(false);
    touch(art.video, 'touchstart', 150);
    touch(art.video, 'touchmove', 190);
    expect(art.currentTime).toBe(60);
    expect(bars).toHaveBeenLastCalledWith('played', .6);
    expect(hud().hidden).toBe(false);
    expect(hud().textContent).toBe('1分钟0秒 / 1分钟40秒');
    touch(art.video, 'touchend', 190);
    expect(art.template.$player.dataset.crayonScrubbing).toBeUndefined();
  } finally { gestures(); }
});

it('seeks to the finger position on the bar, tracks outside it, and clamps both ends', () => {
  const bars = jest.fn(); art.on('setBar', bars);
  const progress = art.template.$progress;
  const native = jest.fn(); progress.addEventListener('touchstart', native);
  touch(progress, 'touchstart', 110, 190);
  expect(art.currentTime).toBe(25);
  expect(native).not.toHaveBeenCalled();
  touch(window, 'touchmove', 290, 230);
  expect(art.currentTime).toBe(75);
  expect(bars).toHaveBeenLastCalledWith('played', .75);
  expect(hud().textContent).toBe('1分钟15秒 / 1分钟40秒');
  expect(progress.getAttribute('aria-valuenow')).toBe('75');
  touch(window, 'touchmove', -50); expect(art.currentTime).toBe(0);
  touch(window, 'touchend', 500); expect(art.currentTime).toBe(100);
  touch(window, 'touchmove', 100); expect(art.currentTime).toBe(100);
});

it('keeps controls visible while dragging and cancels on source change, lock and multitouch', () => {
  for (const cancel of [() => art.video.dispatchEvent(new Event('loadstart')), () => art.emit('lock'), () => touch(window, 'touchcancel', 200), () => window.dispatchEvent(new Event('blur')), () => touch(window, 'touchmove', 200, 190, 2)]) {
    touch(art.template.$progress, 'touchstart', 200, 190);
    control(false); expect(art.controls.show).toBe(true);
    cancel();
    const time = art.currentTime;
    touch(window, 'touchmove', 350);
    expect(art.currentTime).toBe(time);
    expect(art.template.$player.dataset.crayonScrubbing).toBeUndefined();
  }
});

it('uses the bar offset and height in rotated fullscreen', () => {
  art.isRotate = true;
  art.template.$progress.getBoundingClientRect = () => ({ left: 0, top: 120, height: 400, width: 20 } as DOMRect);
  touch(art.template.$progress, 'touchstart', 10, 220);
  expect(art.currentTime).toBe(25);
  touch(window, 'touchend', 10, 420);
  expect(art.currentTime).toBe(75);
});

it('supports mouse drags and keyboard seek and ignores locked/live playback', () => {
  const progress = art.template.$progress;
  progress.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 110 }));
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 290 }));
  expect(art.currentTime).toBe(75);
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 200 }));
  expect(art.currentTime).toBe(50);
  progress.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(art.currentTime).toBe(55);
  art.isLock = true;
  touch(progress, 'touchstart', 20); expect(art.currentTime).toBe(55);
  art.isLock = false; art.option.isLive = true;
  touch(progress, 'touchstart', 20); expect(art.currentTime).toBe(55);
  art.emit('video:durationchange'); expect(hud().hidden).toBe(true);
});

it('shows a synchronized mini bar only with controls hidden and remembers the setting', () => {
  const setting = miniProgressSetting();
  expect(setting.switch).toBe(false);
  const enabled = setting.onSwitch!.call(art, { switch: false } as any, document.createElement('div'), new Event('click'));
  expect(enabled).toBe(true);
  control(false);
  expect(mini().hidden).toBe(false);
  expect(hud().hidden).toBe(true);
  art.seek = 75;
  expect(mini().firstElementChild!.getAttribute('style')).toContain('width: 75%');
  expect(miniProgressSetting().switch).toBe(true);
  control(true); expect(mini().hidden).toBe(true);
  setting.onSwitch!.call(art, { switch: true } as any, document.createElement('div'), new Event('click'));
  control(false); expect(mini().hidden).toBe(true);
  expect(miniProgressSetting().switch).toBe(false);
});

const enableMini = () => {
  miniProgressSetting().onSwitch!.call(art, { switch: false } as any, document.createElement('div'), new Event('click'));
  mini().getBoundingClientRect = () => ({ left: 0, top: 176, width: 400, height: 24, right: 400, bottom: 200 } as DOMRect);
  control(false);
};

it('keeps the mini track visible and controls hidden while picture swipes synchronously seek both directions', () => {
  enableMini();
  const gestures = attachGestures(art);
  try {
    touch(art.video, 'touchstart', 150);
    touch(art.video, 'touchmove', 230);
    expect(art.currentTime).toBe(70);
    expect((mini().firstElementChild as HTMLElement).style.width).toBe('70%');
    expect(mini().hidden).toBe(false);
    expect(art.controls.show).toBe(false);
    expect(hud().hidden).toBe(false);
    expect(mini().getAttribute('aria-valuenow')).toBe('70');
    // An upstream show request during mini scrubbing must not reveal the full bar.
    control(true);
    expect(art.controls.show).toBe(false);
    touch(art.video, 'touchmove', 70);
    expect(art.currentTime).toBe(30);
    expect((mini().firstElementChild as HTMLElement).style.width).toBe('30%');
    touch(art.video, 'touchend', 70);
    expect(art.controls.show).toBe(false);
    expect(mini().hidden).toBe(false);
    expect(hud().hidden).toBe(true);
    expect(art.template.$player.dataset.crayonScrubbingMini).toBeUndefined();
    control(true);
    touch(art.video, 'touchstart', 150); touch(art.video, 'touchmove', 190);
    expect(art.controls.show).toBe(true);
    expect(mini().hidden).toBe(true);
    touch(art.video, 'touchend', 190);
  } finally { gestures(); }
});

it('seeks on mini taps and drags outside the track without revealing controls or toggling playback', () => {
  enableMini();
  touch(mini(), 'touchstart', 100, 190);
  expect(art.currentTime).toBe(25);
  touch(window, 'touchmove', 300, 220);
  expect(art.currentTime).toBe(75);
  expect((mini().firstElementChild as HTMLElement).style.width).toBe('75%');
  expect(art.controls.show).toBe(false);
  touch(window, 'touchmove', -50, 220); expect(art.currentTime).toBe(0);
  touch(window, 'touchend', 500, 220); expect(art.currentTime).toBe(100);
  expect(art.controls.show).toBe(false);
  const duplicate = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 100 });
  mini().dispatchEvent(duplicate);
  expect(duplicate.defaultPrevented).toBe(true);
  expect(art.currentTime).toBe(100);
  expect(art.toggle).not.toHaveBeenCalled();
  expect(art.controls.toggle).not.toHaveBeenCalled();
});

it('handles mini hover, mouse dragging, direct clicks and keyboard input without opening the full bar', () => {
  enableMini();
  const native = jest.fn(); art.template.$player.addEventListener('mousemove', native);
  mini().dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 120, clientY: 190 }));
  expect(native).not.toHaveBeenCalled();
  mini().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100 }));
  expect(art.currentTime).toBe(25);
  mini().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 200 }));
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 }));
  expect(art.currentTime).toBe(75);
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 280 }));
  expect(art.currentTime).toBe(70);
  mini().focus();
  mini().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  expect(art.currentTime).toBe(65);
  expect(mini().getAttribute('role')).toBe('slider');
  expect(mini().getAttribute('aria-valuenow')).toBe('65');
  expect(art.controls.show).toBe(false);
  expect(hud().hidden).toBe(false);
  mini().dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  expect(art.currentTime).toBe(100);
});

it('maps the mini track in rotated fullscreen and cancels on lock, source change and preference changes', () => {
  enableMini(); art.isRotate = true;
  mini().getBoundingClientRect = () => ({ left: 0, top: 100, width: 24, height: 400, right: 24, bottom: 500 } as DOMRect);
  touch(mini(), 'touchstart', 10, 200); expect(art.currentTime).toBe(25);
  touch(window, 'touchmove', 10, 400); expect(art.currentTime).toBe(75);
  art.isLock = true; art.emit('lock');
  expect(mini().getAttribute('aria-disabled')).toBe('true');
  touch(window, 'touchmove', 10, 500); expect(art.currentTime).toBe(75);
  expect(art.template.$player.dataset.crayonScrubbingMini).toBeUndefined();
  art.isLock = false; art.emit('lock');
  touch(mini(), 'touchstart', 10, 200);
  art.video.dispatchEvent(new Event('loadstart'));
  touch(window, 'touchmove', 10, 400); expect(art.currentTime).toBe(25);
  touch(mini(), 'touchstart', 10, 300);
  miniProgressSetting().onSwitch!.call(art, { switch: true } as any, document.createElement('div'), new Event('click'));
  const time = art.currentTime;
  touch(window, 'touchmove', 10, 400); expect(art.currentTime).toBe(time);
  expect(mini().hidden).toBe(true);
  expect(art.controls.show).toBe(false);
});

it('resets the new source progress and removes listeners, UI and accessibility attributes on destroy', () => {
  art.seek = 90;
  art.video.dispatchEvent(new Event('loadstart'));
  expect(hud().textContent).toBe('0秒 / 1分钟40秒');
  dispose();
  expect(hud()).toBeNull(); expect(mini()).toBeNull();
  expect(art.template.$progress.getAttribute('role')).toBeNull();
  expect(touch(art.template.$progress, 'touchstart', 20).defaultPrevented).toBe(false);
});
