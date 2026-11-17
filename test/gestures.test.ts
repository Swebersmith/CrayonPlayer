import { attachGestures, SEEK_SENSITIVITY_CHANGE, SEEK_SENSITIVITY_KEY, seekSensitivitySetting } from '../src/gestures';
import { fakeArt, touch } from './helpers';

function fingers(target: EventTarget, type: string, points: [number, number][]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: points.map(([clientX, clientY], identifier) => ({ clientX, clientY, identifier })) });
  Object.defineProperty(event, 'changedTouches', { value: [] });
  target.dispatchEvent(event);
  return event;
}

let art: ReturnType<typeof fakeArt>;
let dispose: () => void;
beforeEach(() => { jest.useFakeTimers(); art = fakeArt(); art.volume = .5; dispose = attachGestures(art); });
afterEach(() => { dispose(); document.body.innerHTML = ''; localStorage.clear(); jest.useRealTimers(); });
function tap(x: number) { touch(art.video, 'touchstart', x); touch(art.video, 'touchend', x); }

it('double taps seek by side, clamp to duration, and suppress synthetic click/fullscreen', () => {
  tap(350); jest.advanceTimersByTime(100); tap(350);
  expect(art.currentTime).toBe(60);
  jest.advanceTimersByTime(400);
  tap(50); jest.advanceTimersByTime(100); tap(50);
  expect(art.currentTime).toBe(50);
  art.currentTime = 98;
  tap(350); tap(350);
  expect(art.currentTime).toBe(100);
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  art.video.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  jest.advanceTimersByTime(400);
  expect(art.controls.toggle).not.toHaveBeenCalled();
});
it('a single tap only toggles controls and opposite-side taps never seek', () => {
  tap(50); tap(350); jest.advanceTimersByTime(310);
  expect(art.currentTime).toBe(50);
  expect(art.controls.toggle).toHaveBeenCalledTimes(1);
});
it.each(['touchend', 'touchcancel', 'blur', 'loadstart', 'lock'])('restores the exact speed after hold then %s', event => {
  touch(art.video, 'touchstart', 350); jest.advanceTimersByTime(510);
  expect(art.playbackRate).toBe(2);
  if (event === 'blur') window.dispatchEvent(new Event('blur'));
  else if (event === 'loadstart') art.video.dispatchEvent(new Event('loadstart'));
  else if (event === 'lock') art.emit('lock');
  else touch(art.video, event, 350);
  expect(art.playbackRate).toBe(1.25);
  jest.advanceTimersByTime(400);
  expect(art.currentTime).toBe(50);
});
it('does not slow down 3x playback, accelerate paused video, or leak rate on disposal', () => {
  art.playbackRate = 3; touch(art.video, 'touchstart', 350); jest.advanceTimersByTime(510);
  expect(art.playbackRate).toBe(3); dispose(); expect(art.playbackRate).toBe(3);
  dispose = attachGestures(art); art.paused = true;
  touch(art.video, 'touchstart', 350); jest.advanceTimersByTime(510);
  expect(art.playbackRate).toBe(3);
});
it('locks direction, adjusts only the right-side volume, and leaves brightness alone', () => {
  touch(art.video, 'touchstart', 350); touch(art.video, 'touchmove', 352, 50);
  expect(art.volume).toBeGreaterThan(.5);
  expect(art.currentTime).toBe(50);
  jest.advanceTimersByTime(600); expect(art.playbackRate).toBe(1.25);
  touch(art.video, 'touchend', 352, 50);
  touch(art.video, 'touchstart', 50); touch(art.video, 'touchmove', 50, 150);
  expect(art.video.style.filter).toBe('');
  expect(art.currentTime).toBe(50);
  dispose(); expect(art.video.style.filter).toBe('');
});
it('double taps in the middle pause/resume without seeking and zone boundaries stay separate', () => {
  tap(200); tap(200);
  expect(art.toggle).toHaveBeenCalledTimes(1);
  expect(art.currentTime).toBe(50);
  tap(200); tap(200);
  expect(art.toggle).toHaveBeenCalledTimes(2);
  tap(130); tap(140);
  expect(art.currentTime).toBe(50);
  expect(art.toggle).toHaveBeenCalledTimes(2);
});
it('keeps horizontal seeking and ignores controls, lock and multiple fingers', () => {
  touch(art.video, 'touchstart', 150); touch(art.video, 'touchmove', 190, 100); touch(art.video, 'touchend', 190);
  expect(art.currentTime).toBe(60);
  const control = document.createElement('button'); art.template.$player.appendChild(control);
  expect(touch(control, 'touchstart', 100).defaultPrevented).toBe(false);
  art.isLock = true;
  tap(350); tap(350); expect(art.currentTime).toBe(60);
  art.isLock = false;
  touch(art.video, 'touchstart', 350); touch(art.video, 'touchstart', 350, 100, 2);
  jest.advanceTimersByTime(600); expect(art.playbackRate).toBe(1.25);
});
it('does not seek or accelerate live streams and removes all listeners', () => {
  art.option.isLive = true; tap(350); tap(350); expect(art.currentTime).toBe(50);
  touch(art.video, 'touchstart', 350); jest.advanceTimersByTime(600); expect(art.playbackRate).toBe(1.25);
  dispose(); expect(touch(art.video, 'touchstart', 350).defaultPrevented).toBe(false);
});

it('pinches continuously, pans with two fingers, and suppresses seeking and taps through final release', () => {
  touch(art.video, 'touchstart', 150);
  fingers(art.video, 'touchstart', [[150, 100], [250, 100]]);
  fingers(art.video, 'touchmove', [[100, 120], [300, 120]]);
  expect(art.video.style.scale).toBe('2');
  const before = art.video.style.translate;
  fingers(art.video, 'touchmove', [[120, 130], [320, 130]]);
  expect(art.video.style.translate).not.toBe(before);
  fingers(art.video, 'touchend', [[120, 130]]);
  fingers(art.video, 'touchmove', [[300, 100]]);
  fingers(art.video, 'touchend', []);
  jest.advanceTimersByTime(700);
  expect(art.currentTime).toBe(50);
  expect(art.playbackRate).toBe(1.25);
  expect(art.controls.toggle).not.toHaveBeenCalled();
  expect(art.video.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).toBe(false);
  art.template.$player.dispatchEvent(new Event('crayon-reset-video-view'));
  expect(art.video.style.scale).toBe('');
  expect(art.video.style.translate).toBe('');
});

it('maps two-finger movement to rotated fullscreen and restores styles on disposal', () => {
  art.isRotate = true;
  fingers(art.video, 'touchstart', [[100, 100], [200, 100]]);
  fingers(art.video, 'touchmove', [[120, 130], [220, 130]]);
  expect(art.video.style.translate).toBe('30px -20px');
  fingers(art.video, 'touchend', []);
  dispose();
  expect(art.video.style.translate).toBe('');
  expect(art.video.style.scale).toBe('');
});

it('applies the saved and live swipe sensitivity without changing double-tap seek', () => {
  localStorage.setItem(SEEK_SENSITIVITY_KEY, '1.5');
  dispose(); dispose = attachGestures(art);
  touch(art.video, 'touchstart', 150); touch(art.video, 'touchmove', 190, 100);
  expect(art.currentTime).toBe(65);
  art.currentTime = 50;
  art.template.$player.dispatchEvent(new CustomEvent(SEEK_SENSITIVITY_CHANGE, { detail: .5 }));
  touch(art.video, 'touchstart', 150); touch(art.video, 'touchmove', 190, 100);
  expect(art.currentTime).toBe(55);
  art.currentTime = 50;
  art.template.$player.dispatchEvent(new CustomEvent(SEEK_SENSITIVITY_CHANGE, { detail: 'invalid' }));
  touch(art.video, 'touchstart', 150); touch(art.video, 'touchmove', 190, 100);
  expect(art.currentTime).toBe(60);
  tap(350); jest.advanceTimersByTime(100); tap(350);
  expect(art.currentTime).toBe(70);
});

it('persists swipe sensitivity from the settings selector', () => {
  const setting = seekSensitivitySetting();
  expect(setting.name).toBe('crayonSeekSensitivity');
  expect(setting.selector?.find(item => item.default)?.value).toBe(1);
  setting.onSelect!.call(art, { value: 1.5 } as any, document.createElement('div'), new Event('click'));
  expect(localStorage.getItem(SEEK_SENSITIVITY_KEY)).toBe('1.5');
  expect(seekSensitivitySetting().selector?.find(item => item.default)?.value).toBe(1.5);
});
