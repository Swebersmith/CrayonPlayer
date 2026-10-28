import { crayonAutoOrientation } from '../src/orientation';
import { fakeArt } from './helpers';

it('treats a denied orientation lock as an optional fullscreen capability',async()=>{
  const art=fakeArt();Object.defineProperty(art.video,'videoWidth',{value:1920});Object.defineProperty(art.video,'videoHeight',{value:1080});
  const saved=Object.getOwnPropertyDescriptor(screen,'orientation');
  const lock=jest.fn().mockRejectedValue(new Error('Not supported')),unlock=jest.fn();
  Object.defineProperty(screen,'orientation',{configurable:true,value:{type:'portrait-primary',lock,unlock}});
  crayonAutoOrientation(art);
  try {
    art.emit('fullscreen',true);await new Promise(resolve=>setTimeout(resolve,0));
    expect(lock).toHaveBeenCalledWith('landscape');expect(art.template.$player.classList.contains('art-auto-orientation-fullscreen')).toBe(false);
    art.emit('fullscreen',false);expect(unlock).not.toHaveBeenCalled();
  } finally {art.emit('destroy');art.template.$player.remove();if(saved)Object.defineProperty(screen,'orientation',saved);else delete (screen as any).orientation;}
});

it('releases a successful screen lock on fullscreen exit',async()=>{
  const art=fakeArt();Object.defineProperty(art.video,'videoWidth',{value:1920});Object.defineProperty(art.video,'videoHeight',{value:1080});
  const saved=Object.getOwnPropertyDescriptor(screen,'orientation'),unlock=jest.fn();
  Object.defineProperty(screen,'orientation',{configurable:true,value:{type:'portrait-primary',lock:jest.fn().mockResolvedValue(undefined),unlock}});
  crayonAutoOrientation(art);
  try {
    art.emit('fullscreen',true);await new Promise(resolve=>setTimeout(resolve,0));
    expect(art.template.$player.classList.contains('art-auto-orientation-fullscreen')).toBe(true);
    art.emit('fullscreen',false);expect(unlock).toHaveBeenCalledTimes(1);
  } finally {art.emit('destroy');art.template.$player.remove();if(saved)Object.defineProperty(screen,'orientation',saved);else delete (screen as any).orientation;}
});
