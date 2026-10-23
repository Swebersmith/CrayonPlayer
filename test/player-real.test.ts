import { createCrayonPlayerCore } from '../src/core';
import { touch } from './helpers';

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
  } finally { art.destroy(); container.remove(); pause.mockRestore(); load.mockRestore(); localStorage.clear(); }
});
