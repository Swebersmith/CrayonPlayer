import { attachMobileLibrary } from '../src/mobile-library';
import { fakeArt } from './helpers';

it('follows the visible viewport as the keyboard opens and restores the player on close',()=>{
  const art=fakeArt(),root=art.template.$player;
  const oldViewport=Object.getOwnPropertyDescriptor(window,'visualViewport');
  const oldTouch=Object.getOwnPropertyDescriptor(navigator,'maxTouchPoints');
  const oldWidth=Object.getOwnPropertyDescriptor(window,'innerWidth');
  const viewport=Object.assign(new EventTarget(),{width:390,height:760,offsetTop:0,offsetLeft:0});
  Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
  Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,value:1});
  Object.defineProperty(window,'innerWidth',{configurable:true,value:390});
  root.style.setProperty('--crayon-mobile-height','123px','important');
  const mobile=attachMobileLibrary(art);
  try {
    mobile.open();expect(mobile.active()).toBe(true);expect(root.dataset.crayonLibraryMobile).toBe('true');
    expect(root.style.getPropertyValue('--crayon-mobile-height')).toBe('760px');
    viewport.height=340;viewport.offsetTop=80;viewport.dispatchEvent(new Event('resize'));
    expect(root.style.getPropertyValue('--crayon-mobile-height')).toBe('340px');expect(root.style.getPropertyValue('--crayon-mobile-top')).toBe('80px');
    mobile.close();expect(root.dataset.crayonLibraryMobile).toBeUndefined();
    expect(root.style.getPropertyValue('--crayon-mobile-height')).toBe('123px');expect(root.style.getPropertyPriority('--crayon-mobile-height')).toBe('important');
    mobile.destroy();viewport.height=200;viewport.dispatchEvent(new Event('resize'));
    expect(root.style.getPropertyValue('--crayon-mobile-height')).toBe('123px');
  } finally {
    mobile.destroy();root.remove();
    if(oldViewport)Object.defineProperty(window,'visualViewport',oldViewport);else delete (window as any).visualViewport;
    if(oldTouch)Object.defineProperty(navigator,'maxTouchPoints',oldTouch);else delete (navigator as any).maxTouchPoints;
    Object.defineProperty(window,'innerWidth',oldWidth!);
  }
});
