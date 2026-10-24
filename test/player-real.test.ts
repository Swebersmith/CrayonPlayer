import { createCrayonPlayerCore } from '../src/core';
import { touch } from './helpers';
import { createCrayonPlayer } from '../src/index';
import Hls from 'hls.js';

it('changes download lanes and speed display through real settings without restarting HLS', async () => {
  localStorage.clear();
  URL.revokeObjectURL = jest.fn(); URL.createObjectURL = jest.fn(() => 'blob:test');
  const pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  const load = jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  const supported = jest.spyOn(Hls, 'isSupported').mockReturnValue(true);
  const source = jest.spyOn(Hls.prototype, 'loadSource').mockImplementation(() => undefined);
  const media = jest.spyOn(Hls.prototype, 'attachMedia').mockImplementation(() => undefined);
  const container = document.createElement('div'); document.body.appendChild(container);
  const art = createCrayonPlayer({ container, url: 'https://media.test/video.m3u8', enhancements: { casting: false } });
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    const hls = art.video.hls;
    const setLanes = jest.spyOn(art.video.vodNetwork!, 'setLanes');
    art.setting.show = true;
    container.querySelector<HTMLElement>('[data-name="crayonPrefetch"]')!.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    art.setting.find('crayonPrefetch').selector!.find(item => item.value === 4)!.$item.click();
    expect(setLanes).toHaveBeenCalledWith(4);
    expect(art.video.hls).toBe(hls);
    expect(source).toHaveBeenCalledTimes(1);
    art.setting.find('crayonNetworkSpeed').$item.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const hud = container.querySelector<HTMLElement>('[data-crayon-network-speed]')!;
    expect(hud.hidden).toBe(false);
    const speedControl = hud.parentElement!;
    expect(speedControl.parentElement?.classList.contains('art-controls-right')).toBe(true);
    expect(speedControl.nextElementSibling?.classList.contains('art-control-setting')).toBe(true);
    expect(speedControl.style.display).not.toBe('none');
    expect(art.setting.find('crayonNetworkSpeed').switch).toBe(true);
    expect(localStorage.getItem('crayon-player-prefetch-lanes')).toBe('4');
    expect(localStorage.getItem('crayon-player-network-speed')).toBe('1');
    art.setting.find('crayonNetworkSpeed').$item.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(speedControl.style.display).toBe('none');
  } finally {
    art.destroy(); container.remove();
    pause.mockRestore(); load.mockRestore(); supported.mockRestore(); source.mockRestore(); media.mockRestore();
    localStorage.clear();
  }
});

it('shows explicit switch button states, toggles once, and synchronizes cleared skip settings', async () => {
  localStorage.clear();
  URL.revokeObjectURL = jest.fn(); URL.createObjectURL = jest.fn(() => 'blob:test');
  const pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  const load = jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  const supported = jest.spyOn(Hls, 'isSupported').mockReturnValue(true);
  const source = jest.spyOn(Hls.prototype, 'loadSource').mockImplementation(() => undefined);
  const media = jest.spyOn(Hls.prototype, 'attachMedia').mockImplementation(() => undefined);
  const container = document.createElement('div'); document.body.appendChild(container);
  const art = createCrayonPlayer({ container, url: 'https://media.test/video.m3u8', enhancements: { casting: false }, skip: { enabled: true } });
  const wait = () => new Promise(resolve => setTimeout(resolve, 0));
  const button = (name: string) => art.setting.find(name).$item.querySelector<HTMLButtonElement>('button[role="switch"]')!;
  try {
    await wait(); await wait();
    for (const [name, state] of [['blockAds', true], ['crayonSkip', true], ['crayonMiniProgress', false], ['crayonNetworkSpeed', false]] as const) {
      expect(button(name).textContent).toBe(state ? '已开启' : '已关闭');
      expect(button(name).getAttribute('aria-checked')).toBe(String(state));
      button(name).click(); await wait();
      expect(art.setting.find(name).switch).toBe(!state);
      expect(button(name).textContent).toBe(state ? '已关闭' : '已开启');
      expect(button(name).getAttribute('aria-checked')).toBe(String(!state));
    }
    // Clicking the nested button must not trigger a second reload/toggle.
    expect(source).toHaveBeenCalledTimes(2);
    button('crayonSkip').click(); await wait();
    expect(button('crayonSkip').textContent).toBe('已开启');
    const clear = art.setting.option.find(item => item.html === '删除跳过配置')!;
    clear.$item.click(); await wait();
    expect(art.setting.find('crayonSkip').switch).toBe(false);
    expect(button('crayonSkip').textContent).toBe('已关闭');
    const keydown = jest.fn(); art.template.$player.addEventListener('keydown', keydown);
    button('crayonNetworkSpeed').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(keydown).not.toHaveBeenCalled();
    // The same state should survive a settings re-render.
    art.setting.update({ name: 'blockAds', html: '去广告', switch: false, tooltip: '' });
    await wait();
    expect(button('blockAds').textContent).toBe('已关闭');
    expect(art.setting.find('blockAds').$item.querySelectorAll('button[role="switch"]')).toHaveLength(1);
  } finally {
    art.destroy(); container.remove(); localStorage.clear();
    pause.mockRestore(); load.mockRestore(); supported.mockRestore(); source.mockRestore(); media.mockRestore();
  }
});

it('releases the webpage fullscreen overlay when the independent player is destroyed',()=>{
  URL.revokeObjectURL=jest.fn();URL.createObjectURL=jest.fn(()=>'blob:test');
  const pause=jest.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>undefined);
  const load=jest.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>undefined);
  const container=document.createElement('div');document.body.appendChild(container);
  const art=createCrayonPlayerCore({container,url:'https://media.example/video.mp4'},{casting:false});
  const root=art.template.$player;
  try{
    art.fullscreenWeb=true;
    expect(root.parentElement).toBe(document.body);
    art.destroy();
    expect(root.isConnected).toBe(false);
    expect(container.children).toHaveLength(0);
  }finally{if(!art.isDestroy)art.destroy();container.remove();pause.mockRestore();load.mockRestore();}
});

it('keeps controls and inline video in Crayon when element fullscreen is unavailable',()=>{
  URL.revokeObjectURL=jest.fn();URL.createObjectURL=jest.fn(()=>'blob:test');
  const pause=jest.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>undefined);
  const load=jest.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>undefined);
  const container=document.createElement('div');document.body.appendChild(container);
  const art=createCrayonPlayerCore({container,url:'https://media.example/video.mp4',fullscreen:true,playsInline:false,moreVideoAttr:{controls:true}},{casting:false});
  const native=jest.fn();
  Object.assign(art.video,{webkitSupportsFullscreen:true,webkitEnterFullscreen:native});
  try{
    art.emit('video:loadedmetadata',new Event('loadedmetadata'));
    expect(art.video.controls).toBe(false);
    expect(art.video.hasAttribute('playsinline')).toBe(true);
    expect(art.video.hasAttribute('webkit-playsinline')).toBe(true);
    const fullscreen=container.querySelector<HTMLElement>('.art-control-fullscreen')!;
    expect(fullscreen).not.toBeNull();
    expect(container.querySelector('.art-control-fullscreenWeb')).not.toBeNull();
    fullscreen.click();
    expect(art.fullscreenWeb).toBe(true);
    expect(art.template.$player.parentElement).toBe(document.body);
    expect(art.template.$player.querySelector('.art-controls')).not.toBeNull();
    expect(native).not.toHaveBeenCalled();
    art.emit('dblclick',new MouseEvent('click'));
    expect(art.fullscreenWeb).toBe(false);
    expect(native).not.toHaveBeenCalled();
  }finally{if(art.fullscreenWeb)art.fullscreenWeb=false;art.destroy();container.remove();pause.mockRestore();load.mockRestore();}
});

it('enters and exits fullscreen on the entire player and never calls the system video fullscreen method',async()=>{
  URL.revokeObjectURL=jest.fn();URL.createObjectURL=jest.fn(()=>'blob:test');
  const pause=jest.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>undefined);
  const load=jest.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>undefined);
  const container=document.createElement('div');document.body.appendChild(container);
  const art=createCrayonPlayerCore({container,url:'https://media.example/video.mp4',fullscreen:true,fullscreenWeb:true},{casting:false});
  const root=art.template.$player;
  const savedElement=Object.getOwnPropertyDescriptor(document,'fullscreenElement');
  const savedExit=Object.getOwnPropertyDescriptor(document,'exitFullscreen');
  let active:Element|null=null;
  Object.defineProperty(document,'fullscreenElement',{get:()=>active,configurable:true});
  const enter=jest.fn(async()=>{active=root;document.dispatchEvent(new Event('fullscreenchange'));});
  const exit=jest.fn(async()=>{active=null;document.dispatchEvent(new Event('fullscreenchange'));});
  Object.defineProperty(root,'requestFullscreen',{value:enter,configurable:true});
  Object.defineProperty(document,'exitFullscreen',{value:exit,configurable:true});
  const native=jest.fn();Object.assign(art.video,{webkitSupportsFullscreen:true,webkitEnterFullscreen:native});
  try{
    art.emit('video:loadedmetadata',new Event('loadedmetadata'));
    const button=root.querySelector<HTMLElement>('.art-control-fullscreen')!;
    button.click();await Promise.resolve();
    expect(enter).toHaveBeenCalledTimes(1);
    expect(document.fullscreenElement).toBe(root);
    expect(root.querySelector('.art-controls')).not.toBeNull();
    expect(button.getAttribute('aria-label')).toBe('退出全屏');
    expect(art.fullscreenWeb).toBe(false);
    button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await Promise.resolve();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(document.fullscreenElement).toBeNull();
    expect(button.getAttribute('aria-label')).toBe('全屏');
    expect(native).not.toHaveBeenCalled();
  }finally{
    art.destroy();container.remove();pause.mockRestore();load.mockRestore();
    if(savedElement)Object.defineProperty(document,'fullscreenElement',savedElement);else delete (document as any).fullscreenElement;
    if(savedExit)Object.defineProperty(document,'exitFullscreen',savedExit);else delete (document as any).exitFullscreen;
  }
});

it('renders a manual volume submenu in real ArtPlayer and closes it with controls', async () => {
  URL.revokeObjectURL = jest.fn();
  URL.createObjectURL = jest.fn(()=>'blob:test');
  const pause = jest.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>undefined);
  const load = jest.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>undefined);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const art = createCrayonPlayerCore({container,url:'https://media.example/video.mp4',setting:true,autoplay:false},{gestures:false,casting:false});
  try {
    art.setting.show = true;
    const item = container.querySelector<HTMLElement>('[data-name="crayonVolume"]')!;
    expect(item).not.toBeNull();
    item.click();
    await new Promise(resolve=>setTimeout(resolve,0));
    const input = container.querySelector<HTMLInputElement>('[aria-label="播放音量"]')!;
    expect(input).not.toBeNull();
    expect(art.template.$player.style.getPropertyValue('--art-settings-max-height')).toContain('100% - 56px');
    expect(input.style.height).toBe('24px');
    input.value = '35'; input.dispatchEvent(new Event('input',{bubbles:true}));
    expect(art.volume).toBe(.35);
    art.controls.show = false;
    expect(art.setting.show).toBe(false);
  } finally { art.destroy(); container.remove(); pause.mockRestore(); load.mockRestore(); }
});

it('synchronizes real ArtPlayer bars and time labels on both drag surfaces before timeupdate', async () => {
  URL.revokeObjectURL = jest.fn();
  URL.createObjectURL = jest.fn(()=>'blob:test');
  localStorage.clear();
  const pause = jest.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>undefined);
  const load = jest.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>undefined);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const art = createCrayonPlayerCore({container,url:'https://media.example/video.mp4',setting:true,autoplay:false},{casting:false});
  try {
    Object.defineProperty(art.video,'duration',{value:4000,configurable:true});
    art.video.getBoundingClientRect = () => ({left:0,top:0,width:400,height:225} as DOMRect);
    art.template.$progress.getBoundingClientRect = () => ({left:20,top:200,width:360,height:24} as DOMRect);
    art.currentTime = 600;
    touch(art.video,'touchstart',150);
    touch(art.video,'touchmove',190);
    expect(art.currentTime).toBe(630);
    const played = container.querySelector<HTMLElement>('.art-progress-played')!;
    const indicator = container.querySelector<HTMLElement>('.art-progress-indicator')!;
    expect(played.style.width).toBe('15.75%');
    expect(indicator.style.left).toBe('15.75%');
    expect(container.querySelector('[data-crayon-progress-time]')!.textContent).toBe('10分钟30秒 / 1小时6分钟40秒');
    touch(art.video,'touchend',190);
    touch(art.template.$progress,'touchstart',200,210);
    touch(window,'touchmove',290,210);
    expect(art.currentTime).toBe(3000);
    expect(played.style.width).toBe('75%');
    expect(indicator.style.left).toBe('75%');
    touch(window,'touchend',290,210);
    const miniSwitch = container.querySelector<HTMLElement>('[data-name="crayonMiniProgress"]')!;
    miniSwitch.click();
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(art.setting.find('crayonMiniProgress').switch).toBe(true);
    art.controls.show = false;
    const mini = container.querySelector<HTMLElement>('[data-crayon-mini-progress]')!;
    expect(mini.hidden).toBe(false);
    expect((mini.firstElementChild as HTMLElement).style.width).toBe('75%');
    expect(art.setting.show).toBe(false);
    touch(art.video,'touchstart',150);
    touch(art.video,'touchmove',110);
    expect(art.currentTime).toBe(2970);
    expect((mini.firstElementChild as HTMLElement).style.width).toBe('74.25%');
    expect(mini.hidden).toBe(false);
    expect(art.controls.show).toBe(false);
    expect(art.template.$player.classList.contains('art-hover')).toBe(false);
    touch(art.video,'touchend',110);
    mini.getBoundingClientRect=()=>({left:0,top:201,right:400,bottom:225,width:400,height:24} as DOMRect);
    mini.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:100,clientY:215}));
    expect(art.controls.show).toBe(false);
    mini.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,clientX:100,clientY:215}));
    expect(art.currentTime).toBe(1000);
    window.dispatchEvent(new MouseEvent('mousemove',{clientX:300,clientY:240}));
    expect(art.currentTime).toBe(3000);
    window.dispatchEvent(new MouseEvent('mouseup',{clientX:240,clientY:240}));
    expect(art.currentTime).toBe(2400);
    expect(played.style.width).toBe('60%');
    expect((mini.firstElementChild as HTMLElement).style.width).toBe('60%');
    expect(mini.getAttribute('aria-valuenow')).toBe('2400');
    expect(art.controls.show).toBe(false);
    expect(art.template.$player.classList.contains('art-control-show')).toBe(false);
  } finally { art.destroy(); container.remove(); pause.mockRestore(); load.mockRestore(); localStorage.clear(); }
});
