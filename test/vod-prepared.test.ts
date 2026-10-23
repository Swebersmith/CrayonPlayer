import Hls from 'hls.js';

import { attachVodHls, setHlsAlternative, vodSourceTime } from '../src/vod-playback';

const original = 'https://media.example/episode.m3u8';
const filtered = 'https://tv.example/api/player/media?token=filtered';
const filter = { playlist: '', originalDuration: 100, removed: [{ start: 30, end: 40 }], reason: 'filtered' as const };
let video: HTMLVideoElement;
beforeEach(() => {
  video = document.createElement('video');
  jest.spyOn(Hls, 'isSupported').mockReturnValue(true);
  jest.spyOn(Hls.prototype, 'loadSource').mockImplementation(() => undefined);
  jest.spyOn(Hls.prototype, 'attachMedia').mockImplementation(() => undefined);
  jest.spyOn(video, 'load').mockImplementation(() => undefined);
});
afterEach(() => { video.hls?.destroy(); jest.restoreAllMocks(); });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

it.each([true, false])('uses only the prepared playlist on native-capable iPad even with MSE supported=%s', async mse => {
  jest.spyOn(Hls, 'isSupported').mockReturnValue(mse);
  jest.spyOn(video, 'canPlayType').mockReturnValue('probably');
  video.src = original;
  const rawSource = document.createElement('source'); rawSource.src = original; video.appendChild(rawSource);
  const applied = jest.fn();
  const prepare = jest.fn(async () => ({ url: filtered, filter }));
  expect(attachVodHls(video, original, jest.fn(), true, applied, prepare)).toBeNull();
  expect(video.hasAttribute('src')).toBe(false);
  expect(video.querySelector('source')).toBeNull();
  expect(video.vodNativePending).toBe(true);
  await flush();
  expect(video.src).toBe(filtered);
  expect(Array.from(video.querySelectorAll('source')).map(source => source.src)).toEqual([filtered]);
  expect(video.vodPlaybackUrl).toBe(filtered);
  expect(video.vodNativePending).toBe(false);
  expect(Hls.prototype.attachMedia).not.toHaveBeenCalled();
  expect(applied).toHaveBeenCalledWith(filter);
  video.currentTime = 40;
  expect(vodSourceTime(video)).toBe(50);
});

it('feeds the same filtered URL to MSE and its native alternative without double filtering the timeline', async () => {
  const applied = jest.fn();
  const hls = attachVodHls(video, original, jest.fn(), true, applied, async () => ({ url: filtered, filter }));
  expect(hls).not.toBeNull();
  expect(Hls.prototype.loadSource).not.toHaveBeenCalled();
  await flush();
  expect(Hls.prototype.loadSource).toHaveBeenCalledTimes(1);
  expect(Hls.prototype.loadSource).toHaveBeenCalledWith(filtered);
  expect(hls!.config.loader).toBe(Hls.DefaultConfig.loader);
  expect(video.querySelector('source')!.src).toBe(filtered);
  expect(video.vodAdFilter).toBe(filter);
  expect(applied).toHaveBeenCalledTimes(1);
});

it('preserves the ManagedMediaSource blob when updating the HTTP fallback', () => {
  const blob = document.createElement('source'); blob.src = 'blob:managed'; blob.type = 'video/mp4';
  const raw = document.createElement('source'); raw.src = original;
  video.append(blob, raw);
  setHlsAlternative(video, filtered);
  expect(Array.from(video.querySelectorAll('source')).map(source => source.src)).toEqual(['blob:managed', filtered]);
  expect(blob.type).toBe('video/mp4');
  expect(video.disableRemotePlayback).toBe(false);
});

it.each([true, false])('fails closed when preparation fails on native=%s', async native => {
  jest.spyOn(video, 'canPlayType').mockReturnValue(native ? 'maybe' : '');
  const failed = jest.fn();
  attachVodHls(video, original, jest.fn(), true, undefined, async () => { throw new Error('offline'); }, failed);
  await flush();
  expect(failed).toHaveBeenCalledTimes(1);
  expect(video.hasAttribute('src')).toBe(false);
  expect(video.querySelector('source')).toBeNull();
  expect(Hls.prototype.loadSource).not.toHaveBeenCalled();
});

it('does not fetch or start the unfiltered source while waiting and ignores preparation after MSE destruction', async () => {
  let resolve!: (value: { url: string; filter: typeof filter }) => void;
  const hls = attachVodHls(video, original, jest.fn(), true, undefined, () => new Promise(done => { resolve = done; }));
  expect(video.vodNativePending).toBe(true);
  hls!.destroy();
  resolve({ url: filtered, filter });
  await flush();
  expect(Hls.prototype.loadSource).not.toHaveBeenCalled();
  expect(video.querySelector('source')).toBeNull();
});

it('keeps ads only when explicitly disabled and never prepares the raw playback', () => {
  jest.spyOn(video, 'canPlayType').mockReturnValue('maybe');
  const prepare = jest.fn();
  attachVodHls(video, original, jest.fn(), false, undefined, prepare);
  expect(video.src).toBe(original);
  expect(prepare).not.toHaveBeenCalled();
});
