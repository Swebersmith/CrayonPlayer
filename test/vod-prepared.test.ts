import Hls from 'hls.js';

import { MediaPreparationError } from '../src/media-client';
import { adFixture } from './__fixtures__/vod-playlist';
import { attachVodHls, attachVodRecovery, setHlsAlternative, vodSourceTime } from '../src/vod-playback';

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

it.each([true, false])('uses Crayon MSE/MMS without a native alternative when native HLS is available=%s', async native => {
  jest.spyOn(video, 'canPlayType').mockReturnValue(native ? 'probably' : '');
  video.src = original;
  const rawSource = document.createElement('source'); rawSource.src = original; video.appendChild(rawSource);
  const applied = jest.fn();
  const prepare = jest.fn(async () => ({ url: filtered, filter }));
  expect(attachVodHls(video, original, jest.fn(), true, applied, prepare)).toBe(video.hls);
  expect(video.hasAttribute('src')).toBe(false);
  expect(video.querySelector('source')).toBeNull();
  expect(video.vodNativePending).toBe(true);
  await flush();
  expect(video.src).toBe('');
  expect(video.querySelector('source')).toBeNull();
  expect(video.vodPlaybackUrl).toBe(filtered);
  expect(video.vodNativePending).toBe(false);
  expect(Hls.prototype.loadSource).toHaveBeenCalledWith(filtered);
  expect(Hls.prototype.attachMedia).toHaveBeenCalledWith(video);
  expect(video.disableRemotePlayback).toBe(true);
  expect(applied).toHaveBeenCalledWith(filter);
  video.currentTime = 40;
  expect(vodSourceTime(video)).toBe(50);
});

it('feeds the filtered URL only to MSE without double filtering the timeline', async () => {
  const applied = jest.fn();
  const hls = attachVodHls(video, original, jest.fn(), true, applied, async () => ({ url: filtered, filter }));
  expect(hls).not.toBeNull();
  expect(Hls.prototype.loadSource).not.toHaveBeenCalled();
  await flush();
  expect(Hls.prototype.loadSource).toHaveBeenCalledTimes(1);
  expect(Hls.prototype.loadSource).toHaveBeenCalledWith(filtered);
  expect(hls!.config.loader).toBe(Hls.DefaultConfig.loader);
  expect(video.querySelector('source')).toBeNull();
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

it('keeps a native-capable phone in Crayon when server preparation fails', async () => {
  jest.spyOn(video, 'canPlayType').mockReturnValue('maybe');
  const failed = jest.fn();
  attachVodHls(video, original, jest.fn(), true, undefined, async () => { throw new Error('offline'); }, failed);
  await flush();
  expect(failed).toHaveBeenCalledTimes(1);
  expect(video.hasAttribute('src')).toBe(false);
  expect(video.querySelector('source')).toBeNull();
  expect(failed).toHaveBeenCalledWith(expect.any(Error),true);
  expect(Hls.prototype.loadSource).toHaveBeenCalledWith(original);
  expect(video.hls!.config.loader).not.toBe(Hls.DefaultConfig.loader);
  expect(video.disableRemotePlayback).toBe(true);
});

it.each(['probably',''])('reports unsupported MSE without preparing or handing off to native HLS: %s',native=>{
  jest.spyOn(Hls,'isSupported').mockReturnValue(false);
  jest.spyOn(video,'canPlayType').mockReturnValue(native as CanPlayTypeResult);
  const unsupported=jest.fn(), prepare=jest.fn();
  expect(attachVodHls(video,original,unsupported,true,undefined,prepare)).toBeNull();
  expect(unsupported).toHaveBeenCalledTimes(1);
  expect(prepare).not.toHaveBeenCalled();
  expect(video.vodNativePending).toBe(false);
  expect(video.vodNativeRequest).toBeUndefined();
  expect(video.hasAttribute('src')).toBe(false);
  expect(video.querySelector('source')).toBeNull();
});

it('recovers from a relay failure using the real HLS playlist parser with browser-side filtering and no raw native alternative', async () => {
  const realLoadSource = Hls.prototype.loadSource;
  jest.mocked(realLoadSource).mockRestore();
  const playlist = adFixture();
  let details: {totalduration:number; fragments:{url:string}[]} | undefined;
  const transport = jest.spyOn(Hls.DefaultConfig.loader.prototype, 'load').mockImplementation(function(context, _config, callbacks) {
    callbacks.onSuccess({url:context.url,data:playlist},this.stats,context,null);
  });
  const applied = jest.fn();
  const failed = jest.fn();
  const error = new MediaPreparationError('片源清单读取超时',true,'UPSTREAM_TIMEOUT');
  const hls = attachVodHls(video,original,jest.fn(),true,applied,async()=>{throw error;},failed)!;
  hls.on(Hls.Events.LEVEL_LOADED, (_event,data)=>{details=data.details;});
  await flush();
  expect(failed).toHaveBeenCalledWith(error,true);
  expect(transport).toHaveBeenCalled();
  expect(details!.totalduration).toBeCloseTo(288.288);
  expect(details!.fragments.every(fragment=>!fragment.url.includes('insert-'))).toBe(true);
  expect(applied).toHaveBeenCalledWith(expect.objectContaining({reason:'filtered',removed:[{start:144.144,end:156.644}]}));
  expect(video.querySelector('source')).toBeNull();
  expect(video.hasAttribute('src')).toBe(false);
  expect(video.vodNativePending).toBe(false);
  expect(video.vodAdFilter?.removed).toHaveLength(1);
});

it.each([
  new MediaPreparationError('登录已失效',false,'UNAUTHORIZED'),
  new MediaPreparationError('播放地址无效',false,'INVALID_REQUEST'),
])('does not use browser fallback for denied or invalid preparation: %s', async error=>{
  const failed=jest.fn();
  attachVodHls(video,original,jest.fn(),true,undefined,async()=>{throw error;},failed);
  await flush();
  expect(failed).toHaveBeenCalledWith(error,false);
  expect(Hls.prototype.loadSource).not.toHaveBeenCalled();
});

it('ignores a preparation failure after destruction instead of starting browser playback',async()=>{
  let reject!: (error:Error)=>void;
  const failed=jest.fn();
  const hls=attachVodHls(video,original,jest.fn(),true,undefined,()=>new Promise((_resolve,fail)=>{reject=fail;}),failed)!;
  hls.destroy();
  reject(new Error('offline'));
  await flush();
  expect(failed).not.toHaveBeenCalled();
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
  expect(video.src).toBe('');
  expect(video.querySelector('source')).toBeNull();
  expect(Hls.prototype.loadSource).toHaveBeenCalledWith(original);
  expect(prepare).not.toHaveBeenCalled();
});

it('attaches the real HLS ManagedMediaSource as the only source and keeps inline controls',()=>{
  class ManagedSource extends EventTarget { readyState='closed'; sourceBuffers=[]; }
  const saved=Object.getOwnPropertyDescriptor(window,'ManagedMediaSource');
  Object.defineProperty(window,'ManagedMediaSource',{value:ManagedSource,configurable:true});
  const oldCreate=URL.createObjectURL, oldRevoke=URL.revokeObjectURL;
  URL.createObjectURL=jest.fn(()=>'blob:crayon-mms');URL.revokeObjectURL=jest.fn();
  jest.mocked(Hls.prototype.attachMedia).mockRestore();
  video.controls=true;
  try{
    attachVodHls(video,original,jest.fn(),false);
    expect(video.querySelector('source')!.src).toBe('blob:crayon-mms');
    expect(video.querySelectorAll('source')).toHaveLength(1);
    expect(video.hasAttribute('src')).toBe(false);
    expect(video.disableRemotePlayback).toBe(true);
    expect(video.controls).toBe(false);
    expect(video.playsInline).toBe(true);
    expect(video.hasAttribute('webkit-playsinline')).toBe(true);
  }finally{
    video.hls?.destroy();
    if(saved)Object.defineProperty(window,'ManagedMediaSource',saved);else delete (window as any).ManagedMediaSource;
    URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;
  }
});

it('stops repeated fatal network recovery and reports failure without native handoff',()=>{
  const hls=attachVodHls(video,original,jest.fn(),false)!;
  const start=jest.spyOn(hls,'startLoad').mockImplementation(()=>undefined);
  const failed=jest.fn(), destroyed=jest.spyOn(hls,'destroy');
  attachVodRecovery(hls,failed);
  for(let i=0;i<4;i++)hls.trigger(Hls.Events.ERROR,{fatal:true,type:Hls.ErrorTypes.NETWORK_ERROR,details:Hls.ErrorDetails.MANIFEST_LOAD_ERROR,error:new Error('unavailable')} as any);
  expect(start).toHaveBeenCalledTimes(3);
  expect(destroyed).toHaveBeenCalledTimes(1);
  expect(failed).toHaveBeenCalledTimes(1);
  expect(video.hls).toBeUndefined();
  expect(video.querySelector('source')).toBeNull();
});
