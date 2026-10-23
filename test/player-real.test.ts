import { createCrayonPlayerCore } from '../src/core';

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
