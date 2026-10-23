import type Artplayer from 'artplayer';

export function fakeArt() {
  const root = document.createElement('div');
  const video = document.createElement('video');
  const progress = document.createElement('div');
  root.append(video, progress);
  document.body.appendChild(root);
  video.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON() {} });
  progress.getBoundingClientRect = () => ({ left: 20, top: 180, width: 360, height: 20, right: 380, bottom: 200, x: 20, y: 180, toJSON() {} });
  const events: Record<string, Function[]> = {};
  let time = 50;
  const art = {
    template: { $player: root, $progress: progress }, video,
    option: { url: 'https://media.example/1.m3u8', isLive: false },
    isLock: false, isRotate: false, isDestroy: false, paused: false,
    get playing() { return !this.paused; },
    duration: 100, playbackRate: 1.25, muted: false, title: 'Demo',
    get currentTime() { return time; }, set currentTime(value: number) { time = value; },
    set seek(value: number) { time = value; art.emit('seek',value); },
    get volume() { return video.volume; }, set volume(value: number) { video.volume = value; },
    notice: { show: '' }, pause: jest.fn(),
    toggle: jest.fn(() => { art.paused = !art.paused; }),
    setting: { show: false, find: jest.fn(), update: jest.fn() },
    controls: { show: true, toggle: jest.fn(() => { art.controls.show = !art.controls.show; art.emit('control',art.controls.show); }), remove: jest.fn(() => root.querySelector('[aria-label="投屏"]')?.remove()), add: jest.fn(option => { root.appendChild(option.html); }) },
    on(name: string, callback: Function) { (events[name] ||= []).push(callback); },
    off(name: string, callback: Function) { events[name] = (events[name] || []).filter(fn => fn !== callback); },
    emit(name: string, ...args: any[]) { events[name]?.forEach(fn => fn(...args)); },
  };
  return art as unknown as Artplayer & { emit(name: string, ...args: any[]): void };
}

export function touch(target: EventTarget, type: string, x: number, y = 100, count = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = { identifier: 1, clientX: x, clientY: y };
  Object.defineProperty(event, 'touches', { value: type === 'touchend' || type === 'touchcancel' ? [] : Array(count).fill(point) });
  Object.defineProperty(event, 'changedTouches', { value: [point] });
  target.dispatchEvent(event);
  return event;
}
