import type Artplayer from 'artplayer';

export function fakeArt() {
  const root = document.createElement('div');
  const video = document.createElement('video');
  root.appendChild(video);
  document.body.appendChild(root);
  video.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON() {} });
  const events: Record<string, Function[]> = {};
  let time = 50;
  const art = {
    template: { $player: root }, video,
    option: { url: 'https://media.example/1.m3u8', isLive: false },
    isLock: false, isRotate: false, isDestroy: false, paused: false,
    get playing() { return !this.paused; },
    duration: 100, playbackRate: 1.25, muted: false, title: 'Demo',
    get currentTime() { return time; }, set currentTime(value: number) { time = value; },
    set seek(value: number) { time = value; },
    get volume() { return video.volume; }, set volume(value: number) { video.volume = value; },
    notice: { show: '' }, pause: jest.fn(),
    controls: { toggle: jest.fn(), remove: jest.fn(), add: jest.fn(option => { root.appendChild(option.html); }) },
    on(name: string, callback: Function) { (events[name] ||= []).push(callback); },
    off(name: string, callback: Function) { events[name] = (events[name] || []).filter(fn => fn !== callback); },
    emit(name: string) { events[name]?.forEach(fn => fn()); },
  };
  return art as unknown as Artplayer & { emit(name: string): void };
}

export function touch(target: EventTarget, type: string, x: number, y = 100, count = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = { identifier: 1, clientX: x, clientY: y };
  Object.defineProperty(event, 'touches', { value: type === 'touchend' || type === 'touchcancel' ? [] : Array(count).fill(point) });
  Object.defineProperty(event, 'changedTouches', { value: [point] });
  target.dispatchEvent(event);
  return event;
}
