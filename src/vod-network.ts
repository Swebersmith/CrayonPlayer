import Hls from 'hls.js';
import type {
  Fragment, FragmentLoaderContext, HlsConfig, Loader, LoaderCallbacks,
  LoaderConfiguration, LoaderContext, LoaderResponse, LoaderStats,
} from 'hls.js';

export type PrefetchLanes = 1 | 2 | 3 | 4;
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_SEGMENTS = 8;
const WINDOW_SECONDS = 60;

interface Download {
  response: LoaderResponse;
  stats: LoaderStats;
}
interface Job {
  loader: Loader<LoaderContext>;
  promise: Promise<Download>;
  cancel(): void;
  done: boolean;
  claimed: boolean;
  cancelled: boolean;
}

declare global {
  interface HTMLVideoElement {
    vodNetwork?: VodNetwork;
  }
}

// Include ranges: different segments can share one URL in byte-range HLS.
const key = (context: LoaderContext) => JSON.stringify([
  context.url, context.rangeStart || 0, context.rangeEnd || 0,
  context.headers || {},
]);

/** Raw segment cache. Decryption, demuxing, append order and ABR stay with HLS.js. */
export class VodNetwork {
  readonly fragmentLoader: NonNullable<HlsConfig['fLoader']>;
  bytes = 0;
  private jobs = new Map<string, Job>();
  private failed = new Set<string>();
  private claimed = new Set<Job>();
  private hls?: Hls;
  private last?: Fragment;
  private destroyed = false;
  private pendingPump = false;
  private stalled = false;

  constructor(private video: HTMLVideoElement, private lanes: PrefetchLanes) {
    const session = this;
    const Base = Hls.DefaultConfig.loader;
    this.fragmentLoader = class implements Loader<FragmentLoaderContext> {
      private base: Loader<FragmentLoaderContext>;
      private borrowed?: Job;
      private cancelled = false;
      private callbacks?: LoaderCallbacks<FragmentLoaderContext>;
      context: FragmentLoaderContext | null = null;
      stats: LoaderStats;
      constructor(config: HlsConfig) {
        this.base = new Base(config) as Loader<FragmentLoaderContext>;
        this.stats = this.base.stats;
      }
      load(context: FragmentLoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<FragmentLoaderContext>) {
        this.context = context;
        this.callbacks = callbacks;
        const direct = () => {
          if (this.cancelled || session.destroyed) return;
          this.borrowed = undefined;
          this.stats = this.base.stats;
          if (context.part) context.part.stats = this.stats;
          else context.frag.stats = this.stats;
          this.base.load(context, config, session.measure(callbacks));
        };
        const cached = !context.part && session.jobs.get(key(context));
        if (!cached) { direct(); session.advance(context); return; }
        session.jobs.delete(key(context));
        cached.claimed = true;
        session.claimed.add(cached);
        this.borrowed = cached;
        this.stats = cached.loader.stats;
        context.frag.stats = this.stats;
        session.advance(context);
        // Also share an in-flight prefetch instead of downloading it twice.
        void cached.promise.then(download => {
          session.claimed.delete(cached);
          if (this.cancelled || session.destroyed) return;
          // Preserve network timing for ABR without counting cache residence as
          // download time, or treating a cache hit as an infinite-speed request.
          const timing = download.stats.loading;
          const shift = performance.now() - timing.end;
          this.stats = { ...download.stats, loading: {
            start: timing.start + shift, first: timing.first + shift, end: timing.end + shift,
          }, parsing: { start: 0, end: 0 }, buffering: { start: 0, first: 0, end: 0 } };
          context.frag.stats = this.stats;
          callbacks.onSuccess(download.response, this.stats, context, null);
        }, () => { session.claimed.delete(cached); direct(); });
      }
      abort() {
        if (this.cancelled) return;
        this.cancelled = true;
        if (this.borrowed) {
          this.borrowed.cancel();
          this.stats.aborted = true;
          if (this.context) this.callbacks?.onAbort?.(this.stats, this.context, null);
        } else this.base.abort();
      }
      destroy() {
        this.cancelled = true;
        this.borrowed?.cancel();
        this.borrowed = undefined;
        this.callbacks = undefined;
        this.base.destroy();
      }
      getResponseHeader(name: string) { return this.base.getResponseHeader?.(name) || null; }
    };
  }

  private measure<T extends LoaderContext>(callbacks: LoaderCallbacks<T>): LoaderCallbacks<T> {
    let counted = 0;
    const count = (stats: LoaderStats) => {
      // Count only network transfers, never delivery from the prefetch cache.
      this.bytes += Math.max(0, stats.loaded - counted);
      counted = stats.loaded;
    };
    return {
      ...callbacks,
      onProgress: (stats, context, data, network) => {
        count(stats); callbacks.onProgress?.(stats, context, data, network);
      },
      onSuccess: (response, stats, context, network) => {
        count(stats); callbacks.onSuccess(response, stats, context, network);
      },
      onError: (error, context, network, stats) => {
        count(stats); callbacks.onError(error, context, network, stats);
      },
      onTimeout: (stats, context, network) => {
        count(stats); callbacks.onTimeout(stats, context, network);
      },
      onAbort: (stats, context, network) => {
        count(stats); callbacks.onAbort?.(stats, context, network);
      },
    };
  }

  attach(hls: Hls) {
    this.hls = hls;
    hls.on(Hls.Events.FRAG_BUFFERED, (_event, { frag }) => {
      if (frag.type !== 'main' || typeof frag.sn !== 'number') return;
      // A newer playback load may already have advanced the download window.
      if (!this.last || this.last.level !== frag.level || frag.start >= this.last.start) this.last = frag;
      this.schedule();
    });
    hls.on(Hls.Events.LEVEL_SWITCHING, this.reset);
    hls.on(Hls.Events.MANIFEST_LOADING, this.reset);
    hls.on(Hls.Events.DESTROYING, () => this.destroy());
    this.video.addEventListener('seeking', this.reset);
    this.video.addEventListener('pause', this.suspend);
    this.video.addEventListener('ended', this.reset);
    this.video.addEventListener('waiting', this.waiting);
    this.video.addEventListener('playing', this.playing);
    this.video.addEventListener('play', this.schedule);
    this.video.addEventListener('timeupdate', this.schedule);
    this.video.addEventListener('ratechange', this.schedule);
    this.video.addEventListener('loadstart', this.sourceChanged);
  }

  setLanes(lanes: PrefetchLanes) {
    if (this.lanes === lanes) return;
    this.lanes = lanes;
    if (lanes === 1) this.clear();
    else {
      // Keep completed data and the nearest downloads when reducing concurrency.
      const active = [...this.jobs.entries()].filter(([, job]) => !job.done);
      active.slice(lanes - 1).forEach(([id, job]) => { this.jobs.delete(id); job.cancel(); });
    }
    this.schedule();
  }

  private advance(context: FragmentLoaderContext) {
    const frag = context.frag;
    if (context.part || frag.type !== 'main' || typeof frag.sn !== 'number') return;
    // Begin the next downloads while HLS.js fetches/demuxes the current segment,
    // including startup and recovery after a seek.
    this.last = frag;
    this.schedule();
  }

  private suspend = () => {
    for (const [id, job] of this.jobs) {
      if (!job.done) { this.jobs.delete(id); job.cancel(); }
    }
  };

  private waiting = () => {
    this.stalled = true;
    this.suspend();
  };

  private playing = () => {
    this.stalled = false;
    this.schedule();
  };

  private clear = () => {
    const jobs = [...this.jobs.values()];
    this.jobs.clear();
    jobs.forEach(job => job.cancel());
  };

  private reset = () => {
    this.last = undefined;
    this.stalled = false;
    this.failed.clear();
    this.clear();
  };

  private sourceChanged = () => {
    const src = this.video.getAttribute('src');
    // An explicit MP4/native source has replaced the HLS blob source.
    if (src && !src.startsWith('blob:')) {
      this.hls?.destroy();
      this.destroy();
    }
  };

  private schedule = () => {
    if (this.pendingPump || this.destroyed) return;
    this.pendingPump = true;
    queueMicrotask(() => { this.pendingPump = false; this.pump(); });
  };

  private pump() {
    const hls = this.hls;
    const last = this.last;
    if (this.destroyed || !hls || !last || this.lanes === 1 || this.video.paused || this.video.seeking || this.stalled) return;
    const details = hls.levels[last.level]?.details;
    // Let the normal loader handle live/LL-HLS, including partial segments.
    if (!details || details.live || details.partList?.length) return;
    // Playlists can contain thousands of fragments. Locate the next segment in
    // logarithmic time instead of scanning the entire episode after every load.
    const fragments = details.fragments;
    let low = 0;
    let high = fragments.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (fragments[mid].start < last.end - 0.01) low = mid + 1;
      else high = mid;
    }
    const candidates: Fragment[] = [];
    for (let index = low; index < fragments.length && candidates.length < MAX_SEGMENTS; index++) {
      const frag = fragments[index];
      if (frag.start >= last.end + WINDOW_SECONDS) break;
      if (!frag.gap && typeof frag.sn === 'number') candidates.push(frag);
    }
    const allowed = new Set(candidates.map(frag => key(this.context(frag))));
    for (const [id, job] of this.jobs) {
      if (!allowed.has(id)) { this.jobs.delete(id); job.cancel(); }
    }
    // Judge safety by continuous playable time, not by readyState alone (which
    // can report future data with only a fraction of a second left).
    let ahead = 0;
    const buffered = this.video.buffered;
    const time = this.video.currentTime;
    for (let index = 0; index < buffered.length; index++) {
      if (buffered.start(index) <= time && buffered.end(index) > time) {
        ahead = (buffered.end(index) - time) / Math.max(1, this.video.playbackRate);
        break;
      }
    }
    const capacity = this.video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ||
      ahead < Math.max(6, last.duration) ? 1 : this.lanes - 1;
    const active = [...this.jobs.entries()].filter(([, job]) => !job.done);
    active.slice(capacity).forEach(([id, job]) => { this.jobs.delete(id); job.cancel(); });
    for (const frag of candidates) {
      if ([...this.jobs.values()].filter(job => !job.done).length >= capacity) break;
      if (this.jobs.size >= MAX_SEGMENTS || this.cacheBytes() >= MAX_BYTES) break;
      // Init maps and their special AES range/IV rules stay with HLS.js.
      const context = this.context(frag);
      const id = key(context);
      if (!context.url || this.jobs.has(id) || this.failed.has(id) || frag.stats.loaded || frag.loader) continue;
      const loader = new Hls.DefaultConfig.loader(hls.config);
      let resolve!: (download: Download) => void;
      let reject!: () => void;
      const promise = new Promise<Download>((yes, no) => { resolve = yes; reject = no; });
      // Speculative failures are silent; a real playback request retries normally.
      void promise.catch(() => undefined);
      const job: Job = { loader, promise, done: false, claimed: false, cancelled: false,
        cancel: () => {
          if (job.cancelled || job.done) return;
          job.cancelled = true;
          loader.destroy(); reject();
        } };
      this.jobs.set(id, job);
      const failed = () => {
        if (job.cancelled || job.done) return;
        if (this.jobs.get(id) === job) this.jobs.delete(id);
        this.failed.add(id); job.cancel();
      };
      const policy = { ...hls.config.fragLoadPolicy.default, errorRetry: null, timeoutRetry: null };
      const callbacks: LoaderCallbacks<LoaderContext> = this.measure({
        onProgress: () => { if (!job.claimed && this.cacheBytes() > MAX_BYTES) failed(); },
        onSuccess: (response, stats) => {
          if (job.cancelled || job.done || this.destroyed) return;
          if (!job.claimed && this.cacheBytes() > MAX_BYTES) { failed(); return; }
          job.done = true;
          resolve({ response, stats });
          loader.destroy();
          this.schedule();
        },
        onError: () => { failed(); this.schedule(); },
        onTimeout: () => { failed(); this.schedule(); },
      });
      try {
        loader.load(context, {
          loadPolicy: policy, timeout: policy.maxLoadTimeMs,
          maxRetry: 0, retryDelay: 0, maxRetryDelay: 0,
        }, callbacks);
      } catch { failed(); }
    }
  }

  private context(frag: Fragment): FragmentLoaderContext {
    return {
      frag, part: null, url: frag.url, responseType: 'arraybuffer', headers: {},
      rangeStart: Number.isFinite(frag.byteRangeStartOffset) ? frag.byteRangeStartOffset : 0,
      rangeEnd: Number.isFinite(frag.byteRangeEndOffset) ? frag.byteRangeEndOffset : 0,
    };
  }

  private cacheBytes() {
    return [...this.jobs.values()].reduce((sum, job) => sum + job.loader.stats.loaded, 0);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.reset();
    this.claimed.forEach(job => job.cancel());
    this.claimed.clear();
    this.video.removeEventListener('seeking', this.reset);
    this.video.removeEventListener('pause', this.suspend);
    this.video.removeEventListener('ended', this.reset);
    this.video.removeEventListener('waiting', this.waiting);
    this.video.removeEventListener('playing', this.playing);
    this.video.removeEventListener('play', this.schedule);
    this.video.removeEventListener('timeupdate', this.schedule);
    this.video.removeEventListener('ratechange', this.schedule);
    this.video.removeEventListener('loadstart', this.sourceChanged);
    if (this.video.vodNetwork === this) delete this.video.vodNetwork;
    this.hls = undefined;
  }
}
