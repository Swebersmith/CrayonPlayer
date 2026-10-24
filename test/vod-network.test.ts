import Hls from 'hls.js';
import type { Fragment, FragmentLoaderContext, Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext } from 'hls.js';
import { VodNetwork } from '../src/vod-network';

type Request = { loader: Loader<LoaderContext>; context: LoaderContext; callbacks: LoaderCallbacks<LoaderContext> };
let requests: Request[];
let video: HTMLVideoElement;
let network: VodNetwork;
let hls: Hls;
let fragments: Fragment[];
let events: Record<string, Function[]>;
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const emit = (name: string, data: unknown = {}) => events[name]?.forEach(fn => fn(name, data));
const config: LoaderConfiguration = {
  loadPolicy: Hls.DefaultConfig.fragLoadPolicy.default,
  timeout: 20000, maxRetry: 0, retryDelay: 0, maxRetryDelay: 0,
};

function setup(lanes: 1 | 2 | 3 | 4 = 3, live = false) {
  requests = [];
  events = {};
  video = document.createElement('video');
  Object.defineProperty(video, 'paused', { configurable: true, value: false });
  Object.defineProperty(video, 'readyState', { configurable: true, value: 3 });
  const Base = Hls.DefaultConfig.loader;
  fragments = Array.from({ length: 20 }, (_, sn) => ({
    sn, type: 'main', level: 0, start: sn * 6, end: (sn + 1) * 6, duration: 6,
    url: `https://media.test/${sn}.ts`, gap: false,
    byteRangeStartOffset: NaN, byteRangeEndOffset: NaN,
    stats: new Base(Hls.DefaultConfig).stats,
  } as Fragment));
  hls = {
    config: Hls.DefaultConfig,
    levels: [{ details: { fragments, live } }],
    on(name: string, fn: Function) { (events[name] ||= []).push(fn); },
    destroy: jest.fn(() => emit(Hls.Events.DESTROYING)),
  } as unknown as Hls;
  jest.spyOn(Base.prototype, 'load').mockImplementation(function(this: Loader<LoaderContext>, context, _config, callbacks) {
    this.context = context;
    this.stats.loading.start = performance.now();
    requests.push({ loader: this, context, callbacks });
  });
  network = new VodNetwork(video, lanes);
  video.vodNetwork = network;
  network.attach(hls);
}

function complete(request: Request, bytes = 1024) {
  const stats = request.loader.stats;
  stats.loaded = stats.total = bytes;
  stats.loading.first = stats.loading.start + 5;
  stats.loading.end = stats.loading.start + 20;
  request.callbacks.onSuccess({ url: request.context.url, data: new ArrayBuffer(bytes) }, stats, request.context, null);
}

function playback(frag: Fragment) {
  const loader = new network.fragmentLoader(Hls.DefaultConfig);
  const callbacks = { onSuccess: jest.fn(), onError: jest.fn(), onTimeout: jest.fn(), onAbort: jest.fn() };
  const context: FragmentLoaderContext = {
    frag, part: null, url: frag.url, headers: {}, responseType: 'arraybuffer',
    rangeStart: Number.isFinite(frag.byteRangeStartOffset) ? frag.byteRangeStartOffset : 0,
    rangeEnd: Number.isFinite(frag.byteRangeEndOffset) ? frag.byteRangeEndOffset : 0,
  };
  loader.load(context, config, callbacks);
  return { loader, callbacks };
}

afterEach(() => { network?.destroy(); jest.restoreAllMocks(); });

it.each([1, 2, 3, 4] as const)('reserves the playback lane and starts only %i total lanes', async lanes => {
  setup(lanes);
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[0] });
  await tick();
  expect(requests).toHaveLength(lanes - 1);
  expect(requests.every(request => request.context.url !== fragments[0].url)).toBe(true);
});

it('serves completed prefetches without a second transfer or double-counting speed', async () => {
  setup(2);
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[0] }); await tick();
  complete(requests[0]); await tick();
  const { loader, callbacks } = playback(fragments[1]); await tick();
  expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
  expect(requests.filter(request => request.context.url === fragments[1].url)).toHaveLength(1);
  expect(network.bytes).toBe(1024);
  const stats = callbacks.onSuccess.mock.calls[0][1];
  expect(stats.loading.end - stats.loading.start).toBeCloseTo(20);
  expect(fragments[1].stats).toBe(loader.stats);
  loader.destroy();
});

it('shares an in-flight request with playback and preserves its bytes', async () => {
  setup(2);
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[0] }); await tick();
  const { loader, callbacks } = playback(fragments[1]);
  expect(requests).toHaveLength(1);
  expect(callbacks.onSuccess).not.toHaveBeenCalled();
  complete(requests[0], 4096); await tick();
  expect(callbacks.onSuccess.mock.calls[0][0].data.byteLength).toBe(4096);
  expect(network.bytes).toBe(4096);
  loader.destroy();
});

it('falls back to a fresh normal request when a claimed prefetch fails', async () => {
  setup(2);
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[0] }); await tick();
  const { loader, callbacks } = playback(fragments[1]);
  const first = requests[0];
  first.callbacks.onError({ code: 503, text: 'Unavailable' }, first.context, null, first.loader.stats);
  await tick();
  expect(requests).toHaveLength(2);
  expect(callbacks.onError).not.toHaveBeenCalled();
  complete(requests[1]);
  expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
  loader.destroy();
});

it('aborts a claimed prefetch without delivering a stale response', async () => {
  setup(2);
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[0] }); await tick();
  const { loader, callbacks } = playback(fragments[1]);
  loader.abort(); await tick();
  expect(callbacks.onAbort).toHaveBeenCalledTimes(1);
  expect(callbacks.onSuccess).not.toHaveBeenCalled();
  expect(requests).toHaveLength(1);
  loader.destroy();
});

it.each(['seeking', 'pause'])('cancels background work on %s and releases listeners on destroy', async event => {
  setup();
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[0] }); await tick();
  const destroy = requests.map(request => jest.spyOn(request.loader, 'destroy'));
  video.dispatchEvent(new Event(event)); await tick();
  destroy.forEach(fn => expect(fn).toHaveBeenCalledTimes(1));
  network.destroy();
  video.dispatchEvent(new Event('playing')); await tick();
  expect(requests).toHaveLength(2);
  expect(video.vodNetwork).toBeUndefined();
});

it('cancels unused work immediately when the user disables prefetching', async () => {
  setup();
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[0] }); await tick();
  const destroy = requests.map(request => jest.spyOn(request.loader, 'destroy'));
  network.setLanes(1); await tick();
  destroy.forEach(fn => expect(fn).toHaveBeenCalledTimes(1));
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[1] }); await tick();
  expect(requests).toHaveLength(2);
});

it('bounds cached segments and counts progress deltas once', async () => {
  setup(4);
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[0] }); await tick();
  for (let index = 0; index < requests.length; index++) {
    const request = requests[index];
    request.loader.stats.loaded = 512;
    request.callbacks.onProgress?.(request.loader.stats, request.context, new ArrayBuffer(0), null);
    complete(request); await tick();
    if (index > 10) throw new Error('Unbounded prefetch');
  }
  expect(requests).toHaveLength(8);
  expect(network.bytes).toBe(8 * 1024);
});

it('stops caching oversized responses at the memory limit', async () => {
  setup(2);
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[0] }); await tick();
  complete(requests[0], 25 * 1024 * 1024); await tick();
  expect(requests).toHaveLength(1);
  const { loader } = playback(fragments[1]);
  expect(requests).toHaveLength(2);
  loader.destroy();
});

it('distinguishes byte ranges that use the same URL', async () => {
  setup(2);
  Object.assign(fragments[1], { url: 'https://media.test/all.ts', byteRangeStartOffset: 0, byteRangeEndOffset: 100 });
  Object.assign(fragments[2], { url: 'https://media.test/all.ts', byteRangeStartOffset: 100, byteRangeEndOffset: 200 });
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[0] }); await tick();
  complete(requests[0], 100); await tick();
  const { loader, callbacks } = playback(fragments[2]);
  expect(callbacks.onSuccess).not.toHaveBeenCalled();
  expect(requests).toHaveLength(2);
  complete(requests[1], 100); await tick();
  expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
  loader.destroy();
});

it('only prefetches the filtered playlist and clears it on quality changes', async () => {
  setup();
  (hls.levels[0].details!.fragments as Fragment[]) = fragments.filter(frag => frag.sn !== 1);
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[0] }); await tick();
  expect(requests.map(request => request.context.url)).toEqual([fragments[2].url, fragments[3].url]);
  const destroy = requests.map(request => jest.spyOn(request.loader, 'destroy'));
  emit(Hls.Events.LEVEL_SWITCHING); await tick();
  destroy.forEach(fn => expect(fn).toHaveBeenCalledTimes(1));
});

it('leaves live streams and paused playback on the normal loader', async () => {
  setup(4, true);
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[0] }); await tick();
  expect(requests).toHaveLength(0);
  hls.levels[0].details!.live = false;
  Object.defineProperty(video, 'paused', { value: true });
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[0] }); await tick();
  expect(requests).toHaveLength(0);
});

it('releases bandwidth while buffering and resumes prefetching after playback recovers', async () => {
  setup(3);
  Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[0] }); await tick();
  expect(requests).toHaveLength(0);
  Object.defineProperty(video, 'readyState', { value: 3, configurable: true });
  video.dispatchEvent(new Event('playing')); await tick();
  expect(requests).toHaveLength(2);
  const destroy = requests.map(request => jest.spyOn(request.loader, 'destroy'));
  Object.defineProperty(video, 'readyState', { value: 2 });
  video.dispatchEvent(new Event('waiting')); await tick();
  destroy.forEach(fn => expect(fn).toHaveBeenCalledTimes(1));
  expect(requests).toHaveLength(2);
});

it('destroys the HLS session when an MP4 replaces the blob source', async () => {
  setup();
  video.src = 'blob:crayon';
  video.dispatchEvent(new Event('loadstart'));
  expect(hls.destroy).not.toHaveBeenCalled();
  emit(Hls.Events.FRAG_BUFFERED, { frag: fragments[0] }); await tick();
  const destroy = requests.map(request => jest.spyOn(request.loader, 'destroy'));
  video.src = 'https://media.test/movie.mp4';
  video.dispatchEvent(new Event('loadstart')); await tick();
  expect(hls.destroy).toHaveBeenCalledTimes(1);
  destroy.forEach(fn => expect(fn).toHaveBeenCalledTimes(1));
  expect(video.vodNetwork).toBeUndefined();
});
