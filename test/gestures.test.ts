import { attachGestures } from '../src/gestures';
import { fakeArt, touch } from './helpers';

let art: ReturnType<typeof fakeArt>;
let dispose: () => void;
beforeEach(() => { jest.useFakeTimers(); art = fakeArt(); art.volume = .5; dispose = attachGestures(art); });
afterEach(() => { dispose(); document.body.innerHTML = ''; jest.useRealTimers(); });
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
