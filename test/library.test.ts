import { attachVideoLibrary, VideoLibraryController } from '../src/library';
import { fakeArt } from './helpers';
const originalFetch = global.fetch;
let art: ReturnType<typeof fakeArt>, library: VideoLibraryController;
let suspend: jest.Mock, media: jest.Mock;
beforeEach(()=>{
  localStorage.clear();
  art=fakeArt(); suspend=jest.fn(); media=jest.fn();
  global.fetch=jest.fn() as jest.Mock;
});
afterEach(()=>{library?.destroy();art.template.$player.remove();global.fetch=originalFetch;});
const response=(data:unknown,status=200)=>({ok:status===200,status,json:async()=>data});
const source='https://www.iqiyi.com/v_19rrjaail0.html';
const item={id:'360:2:show',title:'<img src=x onerror=alert(1)>西游记',year:'1986',description:'电视剧',platforms:['iqiyi'],links:[{platform:'iqiyi',url:source}]};
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
const submit = async (name: string) => {
  (art.template.$player.querySelector('.crayon-library-form input') as HTMLInputElement).value = name;
  art.template.$player.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await flush();
};
const historyButton = () => (art.template.$player.querySelector('[data-action=history]') as HTMLButtonElement).click();
const historyTerms = () => Array.from(art.template.$player.querySelectorAll('.crayon-library-history-term'), entry => entry.textContent);

it('distinguishes the Mirage series from the same-title film and offers only official fallback navigation',async()=>{
  global.fetch=jest.fn(async()=>response({source:'正版平台直搜',items:[
    {...item,id:'iqiyi:6244560312265801',title:'海市蜃楼',year:'2025',type:'电视剧',episodeCount:24},
    {...item,id:'iqiyi:2045522800',title:'海市蜃楼',year:'2018',type:'电影',episodeCount:1},
  ],providers:[{platform:'youku',name:'优酷',status:'unavailable',count:0,searchUrl:'javascript:alert(1)'}],warning:'优酷暂时无法查询，结果可能不全。'})) as jest.Mock;
  library=attachVideoLibrary(art,{}, {suspend,media,initialUrl:''});library.open();await submit('海市蜃楼');
  const rows=art.template.$player.querySelectorAll('button.crayon-library-result');
  expect(rows).toHaveLength(2);expect(rows[0].textContent).toContain('2025 · 电视剧 · 24 集/期');expect(rows[1].textContent).toContain('2018 · 电影');
  const link=art.template.$player.querySelector<HTMLAnchorElement>('a.crayon-library-result')!;
  expect(link.href).toBe('https://so.youku.com/search_video/q_'+encodeURIComponent('海市蜃楼'));
  expect(new URL((global.fetch as jest.Mock).mock.calls[0][0]).searchParams.get('source')).toBe('official');
});

it('persists recent searches, deduplicates, reuses a term and removes only the chosen record',async()=>{
  global.fetch=jest.fn(async()=>response({items:[],source:'目录'})) as jest.Mock;
  const mount=()=>attachVideoLibrary(art,{}, {suspend,media,initialUrl:''});
  library=mount();library.open();
  await submit('西游记');await submit('流浪地球');await submit('  西游记  ');
  historyButton();expect(historyTerms()).toEqual(['西游记','流浪地球']);
  const calls=(global.fetch as jest.Mock).mock.calls.length;
  (art.template.$player.querySelector('.crayon-library-history-delete') as HTMLButtonElement).click();
  expect(historyTerms()).toEqual(['流浪地球']);expect((global.fetch as jest.Mock).mock.calls).toHaveLength(calls);
  library.destroy();library=mount();library.open();
  expect(historyTerms()).toEqual(['流浪地球']);
  (art.template.$player.querySelector('.crayon-library-history-term') as HTMLButtonElement).click();await flush();
  expect(new URL((global.fetch as jest.Mock).mock.calls[calls][0]).searchParams.get('q')).toBe('流浪地球');
  historyButton();(art.template.$player.querySelector('.crayon-library-history-delete') as HTMLButtonElement).click();
  expect(art.template.$player.querySelector('.crayon-library-history-empty')!.textContent).toContain('暂无搜索记录');
  library.destroy();library=mount();library.open();expect(historyTerms()).toEqual([]);
});

it('bounds history and renders stored names safely without keeping playback URLs or invalid terms',async()=>{
  const key='crayon-player:search-history:v1';
  const name='<img src=x onerror=alert(1)>';
  localStorage.setItem(key,JSON.stringify([null,42,'',name,'https://media.example/private?token=secret',...Array.from({length:25},(_,i)=>'影片'+i)]));
  global.fetch=jest.fn(async()=>response({items:[],source:'目录'})) as jest.Mock;
  library=attachVideoLibrary(art,{}, {suspend,media,initialUrl:''});library.open();
  expect(historyTerms()).toHaveLength(20);expect(historyTerms()[0]).toBe(name);
  expect(art.template.$player.querySelector('.crayon-library-history-list img')).toBeNull();
  await submit('');await submit('长'.repeat(81));await submit('https://media.example/private?token=secret');
  historyButton();expect(historyTerms()).toHaveLength(20);expect(historyTerms().some(value=>value?.includes('secret'))).toBe(false);
});

it('keeps history usable when storage writes fail and ignores a late search after opening history',async()=>{
  const write=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Storage blocked');});
  let finish:(value:unknown)=>void=()=>{};
  global.fetch=jest.fn(()=>new Promise(resolve=>{finish=resolve;})) as jest.Mock;
  try {
    library=attachVideoLibrary(art,{}, {suspend,media,initialUrl:''});library.open();
    await submit('西游记');historyButton();expect(historyTerms()).toEqual(['西游记']);
    finish(response({items:[item],source:'目录'}));await flush();
    expect(historyTerms()).toEqual(['西游记']);expect(art.template.$player.querySelector('.crayon-library-result')).toBeNull();
    (art.template.$player.querySelector('.crayon-library-history-delete') as HTMLButtonElement).click();
    expect(historyTerms()).toEqual([]);
  } finally {write.mockRestore();}
});

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
  const calls=(global.fetch as jest.Mock).mock.calls.length;
  library.openEpisodes();
  expect((root.querySelector('.crayon-library-panel') as HTMLElement).dataset.view).toBe('episodes');
  expect(root.querySelector('.crayon-library-episode-view [aria-current=true]')!.textContent).toBe('第 25 集');
  expect((global.fetch as jest.Mock).mock.calls).toHaveLength(calls);
  expect(document.querySelector('[data-crayon-library]')!.closest('[data-crayon-library]')!.parentElement).toBe(root);
});

it('opens a dedicated episode view with host-provided pages and a clear empty state',()=>{
  library=attachVideoLibrary(art,{source,parser:'native',episodes:[{title:'第25集',url:source,platform:'iqiyi'},{title:'第26集',url:'https://www.iqiyi.com/v_next.html',platform:'iqiyi'}]}, {suspend,media,initialUrl:source});
  library.openEpisodes();
  expect(art.template.$player.querySelectorAll('.crayon-library-episode-view .crayon-library-episodes button')).toHaveLength(2);
  library.destroy();
  library=attachVideoLibrary(art,{}, {suspend,media,initialUrl:''});
  library.openEpisodes();
  expect(art.template.$player.querySelector('.crayon-library-empty')!.textContent).toContain('还没有');
  expect(art.template.$player.querySelector('.crayon-library-episodes')).toBeNull();
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
