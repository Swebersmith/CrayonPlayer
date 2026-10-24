import Hls from 'hls.js';

import { createCrayonPlayer } from '../src/index';

let player: ReturnType<typeof createCrayonPlayer> | undefined;
let container: HTMLDivElement;
beforeEach(()=>{
  localStorage.clear();
  URL.createObjectURL=jest.fn(()=>'blob:test'); URL.revokeObjectURL=jest.fn();
  jest.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>undefined);
  jest.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>undefined);
  container=document.createElement('div'); document.body.appendChild(container);
});
afterEach(()=>{player?.destroy();player=undefined;container.remove();jest.restoreAllMocks();localStorage.clear();});

it('preserves factory playback, skip, next and original-time progress callbacks',()=>{
  const progress=jest.fn(), next=jest.fn();
  player=createCrayonPlayer({container,url:'https://media.example/1.mp4',storageKey:'show:1',onProgress:progress,onNext:next,skip:{enabled:true,intro:30,outro:10},enhancements:{casting:false}});
  Object.defineProperty(player.video,'duration',{value:90,configurable:true});
  player.video.vodAdFilter={playlist:'',originalDuration:100,removed:[{start:10,end:20}],reason:'filtered'};
  player.currentTime=11;
  player.emit('video:timeupdate',new Event('timeupdate'));
  expect(player.currentTime).toBe(20);
  player.currentTime=27; player.emit('pause');
  expect(progress).toHaveBeenLastCalledWith(37,100);
  expect(JSON.parse(localStorage.getItem('show:1')||'{}')).toEqual({url:'https://media.example/1.mp4',time:37});
  player.currentTime=82;
  player.emit('video:timeupdate',new Event('timeupdate'));
  player.emit('video:ended',new Event('ended'));
  expect(next).toHaveBeenCalledTimes(1);
});
it('supports branded advanced options and keeps the explicit container and URL authoritative',()=>{
  player=createCrayonPlayer({container,url:'https://media.example/1.mp4',artplayer:{volume:.2},player:{volume:.4,url:'https://wrong.example/2.mp4'},enhancements:{casting:false}});
  expect(player.volume).toBe(.4);
  expect(player.option.url).toBe('https://media.example/1.mp4');
  expect(player.option.id).toBe('crayon-player');
});
it('restores stored source time after MSE preparation on phones and retains ad toggle functionality',async()=>{
  const url='https://media.example/1.m3u8';
  const filter={playlist:'',originalDuration:100,removed:[{start:10,end:20}],reason:'filtered' as const};
  localStorage.setItem('show:1',JSON.stringify({url,time:37}));
  jest.spyOn(Hls,'isSupported').mockReturnValue(true);
  jest.spyOn(HTMLMediaElement.prototype,'canPlayType').mockReturnValue('probably');
  jest.spyOn(Hls.prototype,'loadSource').mockImplementation(()=>undefined);
  jest.spyOn(Hls.prototype,'attachMedia').mockImplementation(()=>undefined);
  const prepare=jest.fn(async(_url:string,blockAds:boolean)=>({url:'https://tv.example/api/player/media?token='+ (blockAds?'clean':'raw'),filter:blockAds?filter:{playlist:'',originalDuration:0,removed:[],reason:'unsupported' as const}}));
  player=createCrayonPlayer({container,url,storageKey:'show:1',prepareMedia:prepare,enhancements:{casting:false}});
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(player.video.src).toBe('');
  expect(Hls.prototype.loadSource).toHaveBeenCalledWith('https://tv.example/api/player/media?token=clean');
  expect(player.video.hls).toBeDefined();
  expect(player.video.querySelector('source')).toBeNull();
  Object.defineProperty(player.video,'duration',{value:90,configurable:true});
  player.emit('video:canplay',new Event('canplay'));
  expect(player.currentTime).toBe(27);
  const toggle=player.setting.find('blockAds');
  toggle.switch = toggle.onSwitch?.call(player,toggle,container,new Event('click'));
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(Hls.prototype.loadSource).toHaveBeenLastCalledWith('https://tv.example/api/player/media?token=raw');
  Object.defineProperty(player.video,'duration',{value:100,configurable:true});
  player.emit('video:canplay',new Event('canplay'));
  expect(player.currentTime).toBe(37);
  expect(prepare).toHaveBeenLastCalledWith(url,false);
  expect(prepare).toHaveBeenCalledTimes(2);
});

it.each([[true,true],[true,false],[false,true],[false,false]])('controls relay=%s independently from blockAds=%s',async(relay,blockAds)=>{
  const url='https://media.example/episode.m3u8';
  jest.spyOn(Hls,'isSupported').mockReturnValue(true);
  jest.spyOn(Hls.prototype,'loadSource').mockImplementation(()=>undefined);
  jest.spyOn(Hls.prototype,'attachMedia').mockImplementation(()=>undefined);
  const filter={playlist:'',originalDuration:0,removed:[],reason:'unsupported' as const};
  const prepare=jest.fn(async()=>({url:'https://tv.example/api/player/media?token=prepared',filter}));
  player=createCrayonPlayer({container,url,serverRelay:relay,blockAds,prepareMedia:prepare,enhancements:{casting:false}});
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(prepare).toHaveBeenCalledTimes(relay?1:0);
  if(relay)expect(prepare).toHaveBeenCalledWith(url,blockAds);
  expect(Hls.prototype.loadSource).toHaveBeenLastCalledWith(relay?'https://tv.example/api/player/media?token=prepared':url);
  expect(player.video.hls!.config.loader===Hls.DefaultConfig.loader).toBe(relay||!blockAds);
  expect(player.setting.find('serverRelay').switch).toBe(relay);
  expect(player.setting.find('blockAds').switch).toBe(blockAds);
});

it('remembers relay toggles across episodes while preserving original progress and the ad switch',async()=>{
  const url='https://media.example/episode.m3u8';
  jest.spyOn(Hls,'isSupported').mockReturnValue(true);
  jest.spyOn(Hls.prototype,'loadSource').mockImplementation(()=>undefined);
  jest.spyOn(Hls.prototype,'attachMedia').mockImplementation(()=>undefined);
  const filter={playlist:'',originalDuration:100,removed:[{start:10,end:20}],reason:'filtered' as const};
  const prepare=jest.fn(async()=>({url:'https://tv.example/api/player/media?token=filtered',filter}));
  player=createCrayonPlayer({container,url,prepareMedia:prepare,enhancements:{casting:false}});
  await new Promise(resolve=>setTimeout(resolve,0));
  Object.defineProperty(player.video,'duration',{value:90,configurable:true});player.currentTime=27;
  const setting=player.setting.find('serverRelay');
  setting.switch=setting.onSwitch?.call(player,setting,container,new Event('click'));
  expect(Hls.prototype.loadSource).toHaveBeenLastCalledWith(url);
  expect(player.setting.find('blockAds').switch).toBe(true);
  // The direct playlist is also filtered locally: the same original position
  // becomes 37 s when no ad cuts were found, or 27 s with the same 10 s cut.
  Object.defineProperty(player.video,'duration',{value:100,configurable:true});
  player.emit('video:canplay',new Event('canplay'));expect(player.currentTime).toBe(37);
  player.destroy();player=undefined;
  player=createCrayonPlayer({container,url:'https://media.example/next.m3u8',prepareMedia:prepare,enhancements:{casting:false}});
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(player.setting.find('serverRelay').switch).toBe(false);
  expect(Hls.prototype.loadSource).toHaveBeenLastCalledWith('https://media.example/next.m3u8');
  expect(prepare).toHaveBeenCalledTimes(1);
});

it('uses the MP4 relay independently of ads and switches MP4 to direct without constructing HLS',async()=>{
  const url='https://media.example/movie.mp4';
  const filter={playlist:'',originalDuration:0,removed:[],reason:'unsupported' as const};
  const prepare=jest.fn(async()=>({url:'https://tv.example/api/player/media?token=mp4',filter}));
  player=createCrayonPlayer({container,url,blockAds:false,prepareMedia:prepare,enhancements:{casting:false}});
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(prepare).toHaveBeenCalledWith(url,false);
  expect(player.video.src).toBe('https://tv.example/api/player/media?token=mp4');
  const setting=player.setting.find('serverRelay');setting.switch=setting.onSwitch?.call(player,setting,container,new Event('click'));
  expect(player.video.src).toBe(url);expect(player.video.hls).toBeUndefined();
});

it.each([[true,true],[true,false],[false,true],[false,false]])('sends the matching TV source and timeline for relay=%s, blockAds=%s',async(relay,blockAds)=>{
  jest.spyOn(Hls,'isSupported').mockReturnValue(true);
  jest.spyOn(Hls.prototype,'loadSource').mockImplementation(()=>undefined);
  jest.spyOn(Hls.prototype,'attachMedia').mockImplementation(()=>undefined);
  const load=jest.fn(async()=>undefined);
  const context={setOptions:jest.fn(),requestSession:jest.fn(async()=>undefined),getCurrentSession:()=>({loadMedia:load})};
  Object.assign(window,{cast:{framework:{CastContext:{getInstance:()=>context}}},chrome:{cast:{AutoJoinPolicy:{ORIGIN_SCOPED:'origin'},media:{
    DEFAULT_MEDIA_RECEIVER_APP_ID:'test',MediaInfo:class{constructor(public contentId:string,public contentType:string){}},
    GenericMediaMetadata:class{},LoadRequest:class{constructor(public media:unknown){}},
  }}}});
  try{
    const url='https://media.example/cast.m3u8';
    const filter={playlist:'',originalDuration:100,removed:[{start:10,end:20}],reason:'filtered' as const};
    const prepare=jest.fn(async(_url:string,ads:boolean)=>({url:'https://tv.example/api/player/media?token='+(ads?'filtered':'raw'),filter:ads?filter:{...filter,removed:[]}}));
    player=createCrayonPlayer({container,url,serverRelay:relay,blockAds,prepareMedia:prepare});
    await new Promise(resolve=>setTimeout(resolve,0));
    Object.defineProperty(player.video,'duration',{value:100,configurable:true});
    if(blockAds)player.video.vodAdFilter=filter;
    container.querySelector<HTMLButtonElement>('button[aria-label="投屏"]')!.click();
    await new Promise(resolve=>setTimeout(resolve,0));
    // Casting can be warmed before a later seek. Always send the current
    // original time, including when relay-off preparation returns a raw URL.
    player.currentTime=blockAds?62:72;
    Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='Chromecast / Google Cast')!.click();
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({
      currentTime:relay&&blockAds?62:72,
      media:expect.objectContaining({contentId:relay?'https://tv.example/api/player/media?token='+(blockAds?'filtered':'raw'):url}),
    }));
    if(!relay){expect(prepare).not.toHaveBeenCalled();}
    else expect(prepare).toHaveBeenCalledWith(url,blockAds);
  }finally{delete (window as any).cast;delete (window as any).chrome;}
});
