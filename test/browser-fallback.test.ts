import Hls from 'hls.js';
import { probeBrowserRoute, recoverBrowserRoutes, BrowserRoute, playbackConnectionPreference, savePlaybackConnection } from '../demo-browser-fallback';

const candidate = (id: string): BrowserRoute => ({ id, name: id + ' · 浏览器直连', url: 'https://' + id + '.demo.site/index.m3u8', type: 'm3u8', transport: 'browser',
  match: { title: '影片', episodeTitle: '第1集', sourceName: id, sourceId: id } });
let media: HTMLVideoElement[];
let success: boolean;
const addresses = new WeakMap<Hls, string>();
beforeEach(() => {
  media = []; success = true;
  localStorage.clear();
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  jest.spyOn(Hls, 'isSupported').mockReturnValue(true);
  jest.spyOn(Hls.prototype, 'loadSource').mockImplementation(function (this: Hls, url) { addresses.set(this, url); });
  jest.spyOn(Hls.prototype, 'attachMedia').mockImplementation(function (this: Hls, video) {
    media.push(video);
    const short = addresses.get(this)?.includes('short');
    Object.defineProperties(video, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 }, duration: { value: short ? 180 : 1500 } });
    queueMicrotask(() => { if (success) video.dispatchEvent(new Event('loadeddata')); });
  });
  jest.spyOn(Hls.prototype, 'destroy').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

it('confirms decoded dimensions before promoting a direct route and cleans up resources', async () => {
  const route = await probeBrowserRoute(candidate('ffzy'), new AbortController().signal);
  expect(route).toMatchObject({ available: true, transport: 'browser', durationSeconds: 1500, quality: { width: 1920, height: 1080 } });
  expect(route.name).toContain('浏览器直连');
  expect(Hls.prototype.destroy).toHaveBeenCalledTimes(1);
  expect(media[0].hasAttribute('src')).toBe(false);
});

it('recovers an otherwise failed episode, ranks clarity first, and removes the matching unavailable entry', async () => {
  const ready = { ...candidate('server'), url: 'https://player.demo.site/server.m3u8', transport: 'server', quality: { width: 1280, height: 720 }, latencyMs: 1 };
  const data = await recoverBrowserRoutes({ url: ready.url, routes: [ready], browserRoutes: [candidate('ffzy')], unavailableRoutes: [{ ...candidate('ffzy'), available: false, url: '', reason: 'HTTP 403' }] }, new AbortController().signal);
  expect(data.routes.map(route => route.id)).toEqual(['ffzy', 'server']);
  expect(data.url).toBe(candidate('ffzy').url);
  expect(data.unavailableRoutes).toEqual([]);
});

it('keeps failed browser routes unavailable and reports a failure after the bounded timeout', async () => {
  jest.useFakeTimers(); success = false;
  const pending = recoverBrowserRoutes({ routes: [], browserRoutes: [candidate('ffzy')], unavailableRoutes: [] }, new AbortController().signal);
  jest.advanceTimersByTime(10001);
  const data = await pending;
  expect(data.routes).toEqual([]);
  expect(data.url).toBeUndefined();
  expect(data.unavailableRoutes[0].reason).toContain('后端 403，浏览器直连检测超时');
});

it('cancels direct probes when the user changes the requested episode', async () => {
  success = false;
  const controller = new AbortController();
  const pending = recoverBrowserRoutes({ browserRoutes: [candidate('ffzy')] }, controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow('已取消');
  expect(Hls.prototype.destroy).toHaveBeenCalledTimes(1);
});

it('keeps duration safeguards for both direct and existing server routes', async () => {
  const short = { ...candidate('short-server'), quality: { width: 3840, height: 2160 }, durationSeconds: 180 };
  const data = await recoverBrowserRoutes({ url: short.url, routes: [short], browserRoutes: [candidate('ffzy')], unavailableRoutes: [] }, new AbortController().signal);
  expect(data.routes.map(route => route.id)).toEqual(['ffzy']);
  expect(data.unavailableRoutes[0].id).toBe('short-server');
  const failed = await recoverBrowserRoutes({ routes: [], browserRoutes: [candidate('short')], unavailableRoutes: [{ ...candidate('reference'), durationSeconds: 1500, available: false, url: '' }] }, new AbortController().signal);
  expect(failed.routes).toEqual([]);
  expect(failed.unavailableRoutes.find(route => route.id === 'short')?.reason).toContain('时长');
});

it('shares a network probe for duplicate URLs while preserving each source identity', async () => {
  const one = candidate('one');
  const two = { ...candidate('two'), url: one.url };
  const data = await recoverBrowserRoutes({ browserRoutes: [one, two], unavailableRoutes: [{ ...one, available: false, url: '' }, { ...two, available: false, url: '' }] }, new AbortController().signal);
  expect(Hls.prototype.attachMedia).toHaveBeenCalledTimes(1);
  expect(data.routes.map(route => route.match?.sourceId)).toEqual(['one', 'two']);
  expect(data.routes.map(route => route.name.split(' · ')[0])).toEqual(['one', 'two']);
  expect(data.unavailableRoutes).toEqual([]);
});

it('remembers the connection choice and preserves automatic fallback as the default', () => {
  expect(playbackConnectionPreference()).toBe('auto');
  savePlaybackConnection('browser');
  expect(playbackConnectionPreference()).toBe('browser');
  savePlaybackConnection('server');
  expect(playbackConnectionPreference()).toBe('server');
});

it('probes healthy source originals when browser direct is selected', async () => {
  const ready = { ...candidate('server'), url: 'https://player.demo.site/api/jiexi/resolved-media?sig=example', originalUrl: 'https://origin.demo.site/index.m3u8' };
  const data = await recoverBrowserRoutes({ url: ready.url, routes: [ready] }, new AbortController().signal, 'browser');
  expect(data.url).toBe(ready.originalUrl);
  expect(data.routes[0].transport).toBe('browser');
  expect(Hls.prototype.loadSource).toHaveBeenCalledWith(ready.originalUrl);
});

it('honors server-only selection without probing 403 browser candidates', async () => {
  const ready = candidate('server');
  const data = await recoverBrowserRoutes({ url: ready.url, routes: [ready], browserRoutes: [candidate('ffzy')] }, new AbortController().signal, 'server');
  expect(data.url).toBe(ready.url);
  expect(data.routes).toEqual([ready]);
  expect(Hls.prototype.attachMedia).not.toHaveBeenCalled();
});

it('does not keep a proxy URL when direct mode has no usable original address', async () => {
  const ready = candidate('server');
  const data = await recoverBrowserRoutes({ url: ready.url, routes: [ready] }, new AbortController().signal, 'browser');
  expect(data.url).toBeUndefined();
  expect(data.routes).toEqual([]);
  expect(data.unavailableRoutes[0].reason).toContain('缺少可直连地址');
});
