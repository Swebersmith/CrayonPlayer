import { readFileSync } from 'fs';
import { join } from 'path';

it('runs the direct-script browser bundle and creates the complete standalone player',()=>{
  URL.createObjectURL=jest.fn(()=>'blob:test'); URL.revokeObjectURL=jest.fn();
  const pause=jest.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>undefined);
  const load=jest.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>undefined);
  const bundle=readFileSync(join(__dirname,'../dist/crayon-player.iife.js'),'utf8');
  const api=new Function(bundle+'\nreturn CrayonPlayer;')();
  const container=document.createElement('div');document.body.appendChild(container);
  const player=api.createCrayonPlayer({container,url:'https://media.example/1.mp4',enhancements:{casting:false}});
  try{
    expect(container.querySelector('[data-player="crayon-player"]')).not.toBeNull();
    expect(player.setting.find('crayonVolume')).toBeTruthy();
    expect(player.setting.find('crayonMiniProgress')).toBeTruthy();
    expect(player.setting.find('blockAds')).toBeTruthy();
    expect(typeof api.createMediaPreparer).toBe('function');
  }finally{player.destroy();container.remove();pause.mockRestore();load.mockRestore();}
});
