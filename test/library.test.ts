import { attachVideoLibrary, VideoLibraryController } from '../src/library';
import { fakeArt } from './helpers';
const originalFetch = global.fetch;
let art: ReturnType<typeof fakeArt>, library: VideoLibraryController;
let suspend: jest.Mock, media: jest.Mock;
beforeEach(()=>{
  art=fakeArt(); suspend=jest.fn(); media=jest.fn();
  global.fetch=jest.fn() as jest.Mock;
});
afterEach(()=>{library?.destroy();art.template.$player.remove();global.fetch=originalFetch;});
const response=(data:unknown,status=200)=>({ok:status===200,status,json:async()=>data});
const source='https://www.iqiyi.com/v_19rrjaail0.html';
const item={id:'360:2:show',title:'<img src=x onerror=alert(1)>西游记',year:'1986',description:'电视剧',platforms:['iqiyi'],links:[{platform:'iqiyi',url:source}]};
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));

it('keeps search, episodes and selected-page playback inside the actual player root',async()=>{
  global.fetch=jest.fn(async(input:string)=>response(input.includes('/search')?{items:[item],source:'360影视'}:input.includes('/detail')?{title:'西游记',episodes:[{title:'第 25 集',url:source,platform:'iqiyi'}],platforms:['iqiyi'],total:25}:{url:'https://media.example/resolved.m3u8',type:'m3u8'})) as jest.Mock;
  library=attachVideoLibrary(art,{source:'https://media.example/demo.mp4'}, {suspend,media,initialUrl:'https://media.example/demo.mp4'});
  const root=art.template.$player;
  (root.querySelector('[data-action=search]') as HTMLButtonElement).click();
  (root.querySelector('.crayon-library-form input') as HTMLInputElement).value='西游记';
  root.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await flush();
  expect(root.querySelector('.crayon-library-result')!.textContent).toContain('<img src=x');
  expect(root.querySelector('.crayon-library-result img')).toBeNull();
  (root.querySelector('.crayon-library-result') as HTMLButtonElement).click(); await flush();
  (root.querySelector('.crayon-library-episodes button') as HTMLButtonElement).click(); await flush();
  expect(media).toHaveBeenCalledWith('https://media.example/resolved.m3u8',source,'m3u8',expect.stringContaining('25'));
  expect(library.source()).toBe(source); expect(library.parser()).toBe('ql');
  expect((root.querySelector('.crayon-library-panel') as HTMLElement).hidden).toBe(true);
  expect(document.querySelector('[data-crayon-library]')!.closest('[data-crayon-library]')!.parentElement).toBe(root);
});

it('accepts names only on M1907 and embeds its jx page within the player',async()=>{
  library=attachVideoLibrary(art,{}, {suspend,media,initialUrl:''});
  await expect(library.play('西游记','ql')).rejects.toThrow('HTTP(S)');
  await library.play('西游记','m1907');
  const frame=art.template.$player.querySelector('iframe')!;
  expect(new URL(frame.src).searchParams.get('jx')).toBe('西游记');
  expect(new URL(frame.src).searchParams.has('url')).toBe(false);
  expect(frame.parentElement).toBe(art.template.$player);
  expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
  await library.play('https://media.example/a.mp4','native');
  expect(art.template.$player.querySelector('iframe')).toBeNull();
  expect(media).toHaveBeenLastCalledWith('https://media.example/a.mp4','https://media.example/a.mp4','','');
});

it('cancels late parser responses after switching routes or destroying the player',async()=>{
  let finish:(value:unknown)=>void=()=>{};
  global.fetch=jest.fn(()=>new Promise(resolve=>{finish=resolve;})) as jest.Mock;
  library=attachVideoLibrary(art,{}, {suspend,media,initialUrl:''});
  const pending=library.play(source,'ql');
  await library.play(source,'tx');
  finish(response({url:'https://media.example/late.mp4'})); await pending;
  expect(media).not.toHaveBeenCalled();
  expect(art.template.$player.querySelector('iframe')!.src).toContain('art.txnp.cn');
  library.destroy();
  expect(art.template.$player.querySelector('iframe')).toBeNull();
  expect(art.template.$player.querySelector('[data-crayon-library]')).toBeNull();
});

it('uses the embedded session for searches and locks on an expired session',async()=>{
  const locked=jest.fn();
  global.fetch=jest.fn(async()=>response({error:{code:'UNAUTHORIZED'}},401)) as jest.Mock;
  library=attachVideoLibrary(art,{auth:{accessToken:()=> 'session-token',onUnauthorized:locked}}, {suspend,media,initialUrl:''});
  library.open();
  (art.template.$player.querySelector('.crayon-library-form input') as HTMLInputElement).value='西游记';
  art.template.$player.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); await flush();
  expect((global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization).toBe('Bearer session-token');
  expect(locked).toHaveBeenCalledTimes(1);
});
