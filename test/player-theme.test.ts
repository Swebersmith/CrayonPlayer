import { morphPanel, cancelPanelMotion } from '../src/player-theme';

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
