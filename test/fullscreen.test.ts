import { toggleCrayonFullscreen } from '../src/fullscreen';
import { fakeArt } from './helpers';

afterEach(()=>{document.body.innerHTML='';});

it('supports prefixed element fullscreen with the same independent player instance',async()=>{
  const art=fakeArt(),root=art.template.$player;
  const names=['fullscreenElement','webkitFullscreenElement','exitFullscreen','webkitExitFullscreen'];
  const saved=names.map(name=>Object.getOwnPropertyDescriptor(document,name));
  let active:Element|null=null;
  const enter=jest.fn(async()=>{active=root;}),exit=jest.fn(async()=>{active=null;});
  Object.defineProperty(root,'requestFullscreen',{value:undefined,configurable:true});
  Object.defineProperty(root,'webkitRequestFullscreen',{value:enter,configurable:true});
  Object.defineProperty(document,'fullscreenElement',{value:null,configurable:true});
  Object.defineProperty(document,'webkitFullscreenElement',{get:()=>active,configurable:true});
  Object.defineProperty(document,'exitFullscreen',{value:undefined,configurable:true});
  Object.defineProperty(document,'webkitExitFullscreen',{value:exit,configurable:true});
  try{
    await toggleCrayonFullscreen(art);
    expect(enter).toHaveBeenCalledTimes(1);
    expect(active).toBe(root);
    await toggleCrayonFullscreen(art);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(active).toBeNull();
  }finally{
    names.forEach((name,index)=>{const descriptor=saved[index];if(descriptor)Object.defineProperty(document,name,descriptor);else Reflect.deleteProperty(document,name);});
  }
});

it('retains the source and Crayon UI when element fullscreen is denied',async()=>{
  const art=fakeArt(),root=art.template.$player;
  art.video.src='https://media.example/independent.mp4';
  const enter=jest.fn(async()=>{throw new Error('host denied');});
  Object.defineProperty(root,'requestFullscreen',{value:enter,configurable:true});
  await toggleCrayonFullscreen(art);
  expect(enter).toHaveBeenCalledTimes(1);
  expect(art.fullscreenWeb).toBe(true);
  expect(art.video.src).toBe('https://media.example/independent.mp4');
  await toggleCrayonFullscreen(art);
  expect(art.fullscreenWeb).toBe(false);
});
