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
  const prepare=jest.fn(async()=>({url:'https://tv.example/api/player/media?token=clean',filter}));
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
  toggle.onClick?.call(player,toggle,container,new Event('click'));
  expect(Hls.prototype.loadSource).toHaveBeenCalledWith(url);
  Object.defineProperty(player.video,'duration',{value:100,configurable:true});
  player.emit('video:canplay',new Event('canplay'));
  expect(player.currentTime).toBe(37);
  expect(prepare).toHaveBeenCalledTimes(1);
});
