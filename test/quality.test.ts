import Hls from 'hls.js';
import { createCrayonPlayerCore } from '../src/core';
import { HLS_CHANGE_EVENT } from '../src/quality';

let art: ReturnType<typeof createCrayonPlayerCore>;
let container: HTMLDivElement;
const wait = () => new Promise(resolve => setTimeout(resolve, 0));
function engine() {
  const listeners = new Map<string, Set<Function>>();
  let manual = -1;
  const hls = {
    levels: [
      { width: 1280, height: 720, videoCodec: 'avc1.640028', bitrate: 2000000 },
      { width: 3840, height: 2160, videoCodec: 'hvc1.1.6.L150', bitrate: 10000000 },
    ],
    currentLevel: 0,
    get manualLevel() { return manual; },
    set nextLevel(value: number) { manual = value; },
    on(event: string, callback: Function) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(callback);
    },
    off(event: string, callback: Function) { listeners.get(event)?.delete(callback); },
    emit(event: string) { listeners.get(event)?.forEach(callback => callback()); },
    count() { return [...listeners.values()].reduce((total, group) => total + group.size, 0); },
  };
  return hls;
}
function attach(hls: ReturnType<typeof engine>) {
  art.video.hls = hls as unknown as Hls;
  art.video.dispatchEvent(new Event(HLS_CHANGE_EVENT));
}
beforeEach(() => {
  localStorage.clear();
  URL.createObjectURL = jest.fn(() => 'blob:test');
  URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  art = createCrayonPlayerCore({ container, url: 'https://media.example/video.mp4', setting: true }, { casting: false });
});
afterEach(() => {
  art.destroy();
  container.remove();
  localStorage.clear();
  jest.restoreAllMocks();
});

it('selects actual HLS levels and returns to automatic through real settings without seeking', async () => {
  const hls = engine();
  attach(hls);
  art.video.currentTime = 42;
  const item = art.setting.find('crayonQuality');
  expect(item.selector).toHaveLength(3);
  expect(item.selector![2].html).toContain('2160p · HEVC · 10.0 Mbps');
  item.$item.click();
  item.selector![2].$item.click();
  await wait();
  expect(hls.manualLevel).toBe(1);
  expect(art.video.currentTime).toBe(42);
  expect(art.video.paused).toBe(true);
  expect(item.tooltip).toContain('切换中');
  hls.currentLevel = 1;
  hls.emit(Hls.Events.LEVEL_SWITCHED);
  expect(item.tooltip).toBe('2160p');
  item.$item.click();
  item.selector![0].$item.click();
  await wait();
  expect(hls.manualLevel).toBe(-1);
  expect(item.tooltip).toBe('自动 · 2160p');
});

it('refreshes parsed manifests, replaces engines, rejects stale choices and releases listeners', () => {
  const first = engine();
  attach(first);
  const old = art.setting.find('crayonQuality');
  const oldChoice = old.selector![2];
  const oldSelect = old.onSelect!;
  const second = engine();
  second.levels = [second.levels[0]];
  attach(second);
  expect(first.count()).toBe(0);
  oldSelect.call(art, oldChoice as any, container, new Event('click'));
  expect(second.manualLevel).toBe(-1);
  second.levels = [...second.levels, first.levels[1]];
  second.emit(Hls.Events.MANIFEST_PARSED);
  expect(art.setting.find('crayonQuality').selector).toHaveLength(3);
  second.emit(Hls.Events.DESTROYING);
  expect(second.count()).toBe(0);
  expect(art.setting.find('crayonQuality').selector).toHaveLength(1);
  delete art.video.hls;
  attach(first);
  art.plugins.crayonPlayer.destroy();
  expect(first.count()).toBe(0);
});

it('lists only the actual fixed HLS quality and clears it when switching to MP4', () => {
  const hls = engine();
  hls.levels = [{ width: 0, height: 0, videoCodec: 'avc1.640028', bitrate: 0 }];
  attach(hls);
  Object.defineProperty(art.video, 'videoHeight', { value: 2160 });
  art.video.dispatchEvent(new Event('loadedmetadata'));
  expect(art.setting.find('crayonQuality').selector![1].html).toContain('2160p');
  delete art.video.hls;
  art.video.dispatchEvent(new Event(HLS_CHANGE_EVENT));
  expect(hls.count()).toBe(0);
  expect(art.setting.find('crayonQuality').selector).toHaveLength(1);
  expect(art.setting.find('crayonQuality').tooltip).toContain('单一画质');
});
