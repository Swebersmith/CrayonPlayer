import { attachCasting } from '../src/casting';
import { fakeArt } from './helpers';
import { PLAYBACK_POLICY_CHANGE } from '../src/relay-settings';

let art: ReturnType<typeof fakeArt>;
let dispose: () => void;
let source: { url: string; currentTime: number; title: string };
let context: { setOptions: jest.Mock; requestSession: jest.Mock; getCurrentSession: jest.Mock };
let load: jest.Mock;
beforeEach(() => {
  art = fakeArt();
  source = { url: 'https://media.example/video.m3u8?token=a%2Fb&x=1', currentTime: 72, title: 'Episode 1' };
  load = jest.fn(async () => undefined);
  context = { setOptions: jest.fn(), requestSession: jest.fn(async () => undefined), getCurrentSession: jest.fn(() => ({ loadMedia: load })) };
  Object.assign(window, {
    cast: { framework: { CastContext: { getInstance: () => context } } },
    chrome: { cast: {
      AutoJoinPolicy: { ORIGIN_SCOPED: 'origin_scoped' },
      media: { DEFAULT_MEDIA_RECEIVER_APP_ID: 'CC1AD845',
        MediaInfo: class { constructor(public contentId: string, public contentType: string) {} },
        GenericMediaMetadata: class {}, LoadRequest: class { constructor(public media: unknown) {} },
      },
    } },
  });
  dispose = attachCasting(art, { getSource: () => source });
});
afterEach(() => { dispose(); document.body.innerHTML = ''; delete (window as any).cast; delete (window as any).chrome; });
const button = (label: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent === label)!;
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

it('uses original signed URL, original timeline, MIME, title and pauses only after successful load', async () => {
  button('Chromecast / Google Cast').click();
  expect(context.requestSession).toHaveBeenCalledTimes(1);
  expect(art.pause).not.toHaveBeenCalled();
  await flush();
  expect(load).toHaveBeenCalledWith(expect.objectContaining({ currentTime: 72, autoplay: true,
    media: expect.objectContaining({ contentId: source.url, contentType: 'application/x-mpegURL', metadata: { title: 'Episode 1' } }),
  }));
  expect(art.pause).toHaveBeenCalledTimes(1);
});
it('calls AirPlay synchronously in the click handler', () => {
  const picker = jest.fn(); (art.video as any).webkitShowPlaybackTargetPicker = picker;
  button('AirPlay / 系统投屏').click(); expect(picker).toHaveBeenCalledTimes(1);
  expect(context.requestSession).not.toHaveBeenCalled();
});
it('calls remote prompt when AirPlay is absent and handles unsupported browsers', async () => {
  const prompt = jest.fn(async () => undefined); (art.video as any).remote = { prompt };
  button('AirPlay / 系统投屏').click(); expect(prompt).toHaveBeenCalledTimes(1);
  delete (art.video as any).remote;
  button('AirPlay / 系统投屏').click(); expect(art.notice.show).toContain('未提供系统投屏');
});
it.each(['destroy', 'change'])('does not send stale media after delayed picker and %s', async kind => {
  let resolve!: () => void;
  context.requestSession.mockReturnValue(new Promise<void>(done => { resolve = done; }));
  button('Chromecast / Google Cast').click();
  if (kind === 'destroy') dispose();
  else { source = { ...source, url: 'https://media.example/2.m3u8' }; art.video.dispatchEvent(new Event('loadstart')); }
  resolve(); await flush(); expect(load).not.toHaveBeenCalled(); expect(art.pause).not.toHaveBeenCalled();
});
it('rejects blob URLs and does not stop local playback on cast failure', async () => {
  source.url = 'blob:https://site.example/generated';
  button('Chromecast / Google Cast').click(); expect(context.requestSession).not.toHaveBeenCalled();
  source.url = 'https://media.example/a.mp4';
  load.mockRejectedValue(new Error('Receiver refused'));
  button('Chromecast / Google Cast').click(); await flush();
  expect(art.pause).not.toHaveBeenCalled(); expect(art.notice.show).toContain('投屏未连接');
});
it('supports keyboard close and cleans up UI', () => {
  const trigger = document.querySelector<HTMLButtonElement>('[aria-label="投屏"]')!;
  trigger.click(); expect(document.querySelector<HTMLElement>('[aria-label="投屏方式"]')!.hidden).toBe(false);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  dispose(); expect(document.querySelector('[aria-label="投屏方式"]')).toBeNull();
});
it('prepares filtered media before the picker and converts progress to the receiver timeline', async () => {
  dispose();
  const preparedUrl = 'https://tv.example/api/player/media?token=limited';
  const prepareSource = jest.fn(async () => ({ url:preparedUrl,type:'application/x-mpegURL',mapTime:(time:number)=>time-12.5 }));
  dispose = attachCasting(art,{getSource:()=>source,prepareSource});
  document.querySelector<HTMLButtonElement>('[aria-label="投屏"]')!.click();
  await flush();
  source.currentTime = 90;
  button('Chromecast / Google Cast').click();
  expect(context.requestSession).toHaveBeenCalledTimes(1);
  await flush();
  expect(load).toHaveBeenCalledWith(expect.objectContaining({currentTime:77.5,media:expect.objectContaining({contentId:preparedUrl})}));
});
it('never falls back to the unfiltered original while preparation is pending or failing', async () => {
  dispose();
  dispose = attachCasting(art,{getSource:()=>source,prepareSource:async()=>{throw new Error('unavailable');}});
  button('Chromecast / Google Cast').click();
  await flush();
  expect(context.requestSession).not.toHaveBeenCalled();
  expect(load).not.toHaveBeenCalled();
});
it('hides the casting menu when controls hide', () => {
  document.querySelector<HTMLButtonElement>('[aria-label="投屏"]')!.click();
  art.emit('control',false);
  expect(document.querySelector<HTMLElement>('[aria-label="投屏方式"]')!.hidden).toBe(true);
});
it('switches AirPlay to the prepared native playlist instead of handing off the original', async () => {
  dispose();
  const picker = jest.fn(); (art.video as any).webkitShowPlaybackTargetPicker = picker;
  jest.spyOn(art.video,'canPlayType').mockReturnValue('maybe');
  const url = 'https://tv.example/api/player/media?token=airplay';
  const filter = {playlist:'',originalDuration:100,removed:[{start:30,end:40}],reason:'filtered' as const};
  dispose = attachCasting(art,{getSource:()=>source,prepareSource:async()=>({url,type:'application/x-mpegURL',filter,mapTime:time=>time-10})});
  document.querySelector<HTMLButtonElement>('[aria-label="投屏"]')!.click(); await flush();
  button('AirPlay / 系统投屏').click();
  expect(picker).toHaveBeenCalledTimes(1);
  expect(art.video.src).toBe(url);
  expect(art.video.vodAdFilter).toBe(filter);
  art.video.dispatchEvent(new Event('loadedmetadata'));
  expect(art.currentTime).toBe(62);
});

it('invalidates old cast preparations and pending pickers immediately when relay/filter policy changes',async()=>{
  dispose();
  let relay=true;
  let resolveOld!: (value:{url:string})=>void;
  const prepareSource=jest.fn(()=>relay?new Promise<{url:string}>(resolve=>{resolveOld=resolve;}):Promise.resolve({url:source.url}));
  dispose=attachCasting(art,{getSource:()=>source,prepareSource,getHint:()=>relay?'中转已开启':'中转已关闭，电视直连原始片源'});
  const trigger=document.querySelector<HTMLButtonElement>('[aria-label="投屏"]')!;
  trigger.click();
  relay=false;art.template.$player.dispatchEvent(new Event(PLAYBACK_POLICY_CHANGE));
  trigger.click();await flush();
  resolveOld({url:'https://tv.example/stale-filtered.m3u8'});await flush();
  expect(document.querySelector('[aria-label="投屏方式"]')!.textContent).toContain('中转已关闭');
  button('Chromecast / Google Cast').click();await flush();
  expect(load).toHaveBeenLastCalledWith(expect.objectContaining({media:expect.objectContaining({contentId:source.url})}));
  let pickerDone!:()=>void;
  context.requestSession.mockReturnValue(new Promise<void>(resolve=>{pickerDone=resolve;}));
  button('Chromecast / Google Cast').click();
  art.template.$player.dispatchEvent(new Event(PLAYBACK_POLICY_CHANGE));
  const count=load.mock.calls.length;pickerDone();await flush();
  expect(load).toHaveBeenCalledTimes(count);
});
