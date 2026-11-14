import { attachPlaybackStats, playbackStatsSetting } from '../src/playback-stats';
import { fakeArt } from './helpers';

let art: ReturnType<typeof fakeArt>;
let dispose: () => void;
let now: number;
let pending: VideoFrameRequestCallback;
const hud = () => art.template.$player.querySelector<HTMLElement>('[data-crayon-playback-stats]')!;
const frame = (frames: number, width = 1920, height = 1080) => {
  pending(now, { presentedFrames: frames, width, height } as VideoFrameCallbackMetadata);
};
const tick = () => { now += 1000; jest.advanceTimersByTime(1000); };

beforeEach(() => {
  localStorage.clear();
  jest.useFakeTimers();
  now = 0;
  jest.spyOn(performance, 'now').mockImplementation(() => now);
  art = fakeArt();
  Object.defineProperties(art.video, {
    videoWidth: { value: 1920, configurable: true },
    videoHeight: { value: 1080, configurable: true },
    readyState: { value: 4, configurable: true },
    paused: { value: false, configurable: true },
  });
  art.video.requestVideoFrameCallback = jest.fn(callback => { pending = callback; return 1; });
  art.video.cancelVideoFrameCallback = jest.fn();
});
afterEach(() => {
  dispose();
  jest.restoreAllMocks();
  jest.useRealTimers();
  localStorage.clear();
  document.body.innerHTML = '';
});

it('shows decoded frame dimensions and measures fractional presented fps against real time', () => {
  dispose = attachPlaybackStats(art);
  expect(hud().textContent).toBe('1920 × 1080 · — fps');
  frame(1, 1440, 1080);
  tick();
  frame(25, 1440, 1080);
  now += 1;
  tick();
  expect(hud().textContent).toBe('1440 × 1080 · 23.98 fps');
  art.video.playbackRate = 2;
  art.video.dispatchEvent(new Event('ratechange'));
  tick();
  frame(73, 1440, 1080);
  tick();
  expect(hud().textContent).toContain('48 fps');
});

it('resets measurements on pause, seeks, resolution changes and new sources', () => {
  dispose = attachPlaybackStats(art);
  frame(1); tick(); frame(31); tick();
  expect(hud().textContent).toContain('30 fps');
  for (const event of ['pause', 'seeking', 'seeked', 'waiting']) {
    art.video.dispatchEvent(new Event(event));
    expect(hud().textContent).toContain('— fps');
  }
  frame(100, 1280, 720);
  expect(hud().textContent).toBe('1280 × 720 · — fps');
  art.video.dispatchEvent(new Event('loadstart'));
  expect(hud().textContent).toBe('分辨率 — · — fps');
  frame(1, 640, 360); tick(); frame(26, 640, 360); tick();
  expect(hud().textContent).toBe('640 × 360 · 25 fps');
});

it('supports playback-quality counters and excludes dropped frames', () => {
  (art.video as any).requestVideoFrameCallback = undefined;
  let total = 100;
  let dropped = 10;
  art.video.getVideoPlaybackQuality = jest.fn(() => ({ totalVideoFrames: total, droppedVideoFrames: dropped } as VideoPlaybackQuality));
  dispose = attachPlaybackStats(art);
  tick(); total += 30; dropped += 5; tick();
  expect(hud().textContent).toContain('25 fps');
  Object.defineProperty(art.video, 'paused', { value: true });
  tick();
  expect(hud().textContent).toContain('— fps');
});

it('shows an unavailable fps when browser counters are unavailable', () => {
  (art.video as any).requestVideoFrameCallback = undefined;
  (art.video as any).getVideoPlaybackQuality = undefined;
  dispose = attachPlaybackStats(art);
  tick(); tick();
  expect(hud().textContent).toBe('1920 × 1080 · — fps');
});

it('persists the display toggle and releases timers, callbacks and elements', () => {
  dispose = attachPlaybackStats(art);
  const setting = playbackStatsSetting();
  expect(setting.switch).toBe(true);
  setting.onSwitch!.call(art, { switch: true } as any, document.createElement('div'), new Event('click'));
  expect(hud().hidden).toBe(true);
  expect(playbackStatsSetting().switch).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
  setting.onSwitch!.call(art, { switch: false } as any, document.createElement('div'), new Event('click'));
  expect(hud().hidden).toBe(false);
  const element = hud();
  dispose();
  expect(art.video.cancelVideoFrameCallback).toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
  expect(element.isConnected).toBe(false);
  art.video.dispatchEvent(new Event('playing'));
  pending(now, { presentedFrames: 100, width: 3840, height: 2160 } as VideoFrameCallbackMetadata);
  expect(jest.getTimerCount()).toBe(0);
});
