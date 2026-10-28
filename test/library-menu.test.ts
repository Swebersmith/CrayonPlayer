import { attachLibraryMenu } from '../src/library-menu';
import { fakeArt } from './helpers';

let art: ReturnType<typeof fakeArt>, host: HTMLElement, bar: HTMLElement, wake: HTMLButtonElement, panel: HTMLElement;
let menu: ReturnType<typeof attachLibraryMenu>;
beforeEach(()=>{
  jest.useFakeTimers(); art=fakeArt();
  host=document.createElement('div');
  host.innerHTML='<button class="wake">菜单</button><div class="bar"><button>搜索</button><button>线路</button></div><section hidden><input></section>';
  art.template.$player.append(host);
  bar=host.querySelector('.bar')!;wake=host.querySelector('.wake')!;panel=host.querySelector('section')!;
  menu=attachLibraryMenu(art,host,bar,wake,panel);
});
afterEach(()=>{menu.destroy();art.template.$player.remove();jest.useRealTimers();});

it('removes the menu after inactivity and reveals it again on pointer activity',()=>{
  expect(bar.hidden).toBe(false);
  jest.advanceTimersByTime(2500);expect(bar.hidden).toBe(true);expect(wake.getAttribute('aria-expanded')).toBe('false');
  art.template.$player.dispatchEvent(new Event('pointermove'));
  expect(bar.hidden).toBe(false);
  jest.advanceTimersByTime(2000);
  art.template.$player.dispatchEvent(new Event('pointermove'));
  jest.advanceTimersByTime(2000);expect(bar.hidden).toBe(false);
  jest.advanceTimersByTime(500);expect(bar.hidden).toBe(true);
});

it('reveals a hidden menu on the first native tap even if the existing controls toggle off',()=>{
  jest.advanceTimersByTime(2500);
  art.video.dispatchEvent(new Event('touchstart',{bubbles:true}));
  art.emit('control',false);expect(bar.hidden).toBe(false);
  art.video.dispatchEvent(new Event('touchstart',{bubbles:true}));
  art.emit('control',true);expect(bar.hidden).toBe(true);
});

it('keeps touch targets active between finger lift and the synthetic click',()=>{
  menu.hide();wake.click();menu.show();
  const leave=new Event('pointerleave');Object.defineProperty(leave,'pointerType',{value:'touch'});
  art.template.$player.dispatchEvent(leave);art.emit('control',false);
  expect(bar.hidden).toBe(false);expect(bar.hasAttribute('inert')).toBe(false);
  const clicked=jest.fn();bar.querySelector('button')!.addEventListener('click',clicked);
  bar.querySelector('button')!.click();expect(clicked).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(2500);expect(bar.hidden).toBe(true);
});

it('waits until a menu press is released before restarting the idle timer',()=>{
  const press=new Event('pointerdown',{bubbles:true});Object.defineProperty(press,'pointerId',{value:7});
  bar.querySelector('button')!.dispatchEvent(press);jest.advanceTimersByTime(5000);expect(bar.hidden).toBe(false);
  const release=new Event('pointerup');Object.defineProperty(release,'pointerId',{value:7});window.dispatchEvent(release);
  jest.advanceTimersByTime(2499);expect(bar.hidden).toBe(false);jest.advanceTimersByTime(1);expect(bar.hidden).toBe(true);
});

it('keeps keyboard navigation available and leaves an open search panel alone',()=>{
  menu.hide();wake.focus();expect(bar.hidden).toBe(false);
  art.emit('control',false);expect(bar.hidden).toBe(false);
  jest.advanceTimersByTime(5000);expect(bar.hidden).toBe(false);
  bar.querySelector('button')!.focus();art.emit('control',false);expect(bar.hidden).toBe(false);
  bar.querySelector('button')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(bar.hidden).toBe(true);
  art.video.dispatchEvent(new KeyboardEvent('keydown',{key:'m',bubbles:true}));expect(bar.hidden).toBe(false);
  panel.hidden=false;menu.hide();
  art.template.$player.dispatchEvent(new Event('pointermove'));jest.advanceTimersByTime(5000);
  expect(bar.hidden).toBe(true);expect(panel.hidden).toBe(false);
});

it('hides as playback starts and removes timers and global listeners on disposal',()=>{
  art.emit('play');expect(bar.hidden).toBe(true);
  menu.show();menu.destroy();
  art.emit('control',true);art.template.$player.dispatchEvent(new Event('pointermove'));
  jest.advanceTimersByTime(5000);expect(bar.hidden).toBe(true);
});

it('does not dismiss a freshly shown mouse menu when a closing panel loses focus',()=>{
  menu.show();
  host.dispatchEvent(new FocusEvent('focusout',{bubbles:true,relatedTarget:null}));
  expect(bar.hidden).toBe(false);
  jest.advanceTimersByTime(2500);expect(bar.hidden).toBe(true);
});
