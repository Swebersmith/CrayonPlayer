import { attachPlayerTheme, morphPanel, cancelPanelMotion } from '../src/player-theme';
import { fakeArt } from './helpers';

it('measures the first settings animation after revealing and resizing the panel', async () => {
  const art = fakeArt();
  const root = art.template.$player;
  const panel = document.createElement('section');
  panel.className = 'art-settings';
  const button = document.createElement('button');
  button.className = 'art-control-setting';
  button.getBoundingClientRect = () => ({ x: 800, y: 550, width: 46, height: 46 } as DOMRect);
  root.append(panel, button);
  let width = 201;
  panel.getBoundingClientRect = () => ({ x: 700, y: 200, width, height: 300 } as DOMRect);
  root.getBoundingClientRect = () => ({ x: 0, y: 0, width: 1000, height: 600 } as DOMRect);
  const resize = jest.fn(() => {
    expect(panel.hidden).toBe(false);
    width = 250;
  });
  Object.assign(art.setting, { resize });
  const oldAnimate = HTMLElement.prototype.animate;
  const animate = jest.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({ finished: Promise.resolve(), cancel: jest.fn() }));
  HTMLElement.prototype.animate = animate as any;
  const dispose = attachPlayerTheme(art);
  try {
    expect(panel.hidden).toBe(true);
    art.emit('setting', true);
    expect(resize).toHaveBeenCalledTimes(1);
    const frames = animate.mock.calls[0][0];
    expect(frames[1]).toMatchObject({ left: '700px', top: '200px', width: '250px', height: '300px' });
    await Promise.resolve();
  } finally {
    dispose();
    HTMLElement.prototype.animate = oldAnimate;
    root.remove();
  }
});

it('keeps the latest panel open when open/close animations are interrupted',async()=>{
  const root=document.createElement('div'),panel=document.createElement('section');root.append(panel);document.body.append(root);
  const old=HTMLElement.prototype.animate;
  HTMLElement.prototype.animate=jest.fn(()=>({finished:Promise.resolve(),cancel:jest.fn()})) as any;
  const origin={x:10,y:10,width:50,height:30} as DOMRect;
  try{
    const first=morphPanel(root,panel,origin,true);
    const closing=morphPanel(root,panel,origin,false);
    const reopening=morphPanel(root,panel,origin,true);
    expect(await first).toBe(false);expect(await closing).toBe(false);expect(await reopening).toBe(true);
    expect(panel.hidden).toBe(false);expect(root.querySelector('.crayon-morph-surface')).toBeNull();
  }finally{cancelPanelMotion(panel);HTMLElement.prototype.animate=old;root.remove();}
});

it('honors reduced motion and changes panel visibility without animations',async()=>{
  const root=document.createElement('div'),panel=document.createElement('section');root.append(panel);
  const oldMatch=window.matchMedia,oldAnimate=HTMLElement.prototype.animate;
  window.matchMedia=jest.fn(()=>({matches:true})) as any;
  HTMLElement.prototype.animate=jest.fn() as any;
  try{
    await morphPanel(root,panel,undefined,true);expect(panel.hidden).toBe(false);
    await morphPanel(root,panel,undefined,false);expect(panel.hidden).toBe(true);
    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
  }finally{window.matchMedia=oldMatch;HTMLElement.prototype.animate=oldAnimate;}
});
