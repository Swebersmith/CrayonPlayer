import { readFileSync } from 'fs';
import { join } from 'path';
import { playbackEntry } from '../demo-entry';

let listeners: {type:string;listener:EventListener}[];
let create: jest.Mock;
const originalFetch = global.fetch;
beforeEach(()=>{
  jest.resetModules();
  const html=readFileSync(join(__dirname,'../index.html'),'utf8');
  document.body.innerHTML=html.split('<body>')[1].split('</body>')[0];
  document.body.removeAttribute('data-embedded'); document.body.removeAttribute('data-entry-error');
  listeners=[];
  const add=window.addEventListener.bind(window);
  jest.spyOn(window,'addEventListener').mockImplementation((type,listener,options)=>{
    if(type==='pagehide'||type==='pageshow')listeners.push({type,listener:listener as EventListener});
    add(type,listener,options);
  });
  create=jest.fn(()=>({destroy:jest.fn()}));
  jest.doMock('../src/index',()=>({createCrayonPlayer:create,createMediaPreparer:jest.fn(()=>jest.fn())}));
  global.fetch=jest.fn(async()=>({ok:true,json:async()=>({expiresAt:Date.now()+3600000})})) as jest.Mock;
  sessionStorage.clear();
  Object.assign(global,{__CRAYON_PREPARE_ENDPOINT__:'/api/player/prepare'});
});
afterEach(()=>{
  window.dispatchEvent(new Event('pagehide'));
  listeners.forEach(({type,listener})=>window.removeEventListener(type,listener));
  jest.restoreAllMocks(); global.fetch=originalFetch;
  window.history.replaceState(null,'','/'); document.body.innerHTML='';
});

it.each(['/', '/parse?url=https%3A%2F%2Fmedia.example%2Fmovie.mp4', '/?embed=1'])('starts immediately without authentication at %s', path=>{
  window.history.replaceState(null,'',path);
  require('../demo');
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0][0]).toMatchObject({prepareMedia:'/api/player/prepare'});
  expect(create.mock.calls[0][0].library).toBeUndefined();
  expect(global.fetch).not.toHaveBeenCalled();
  for (const selector of ['#viewer-gate','#show-integration','#integration-guide','#sign-out','#library-dock']) {
    expect(document.querySelector(selector)).toBeNull();
  }
});

it('shows unsafe query errors without creating a player',()=>{
  window.history.replaceState(null,'','/parse?url=javascript:alert(1)');
  require('../demo');
  expect(create).not.toHaveBeenCalled();
  expect(document.body.dataset.entryError).toBe('true');
});

it('loads a media address through the form and destroys the previous player',()=>{
  require('../demo');
  const first=create.mock.results[0].value;
  const input=document.querySelector<HTMLInputElement>('#source-url')!;
  input.value='https://media.example/movie.mp4?token=a+b&part=2';
  document.querySelector('#source-form')!.dispatchEvent(new Event('submit',{cancelable:true}));
  expect(first.destroy).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[1][0].url).toBe(input.value);
  input.value='javascript:alert(1)';
  document.querySelector('#source-form')!.dispatchEvent(new Event('submit',{cancelable:true}));
  expect(create).toHaveBeenCalledTimes(2);
  expect(document.body.dataset.entryError).toBe('true');
});

it('supports static playback without a preparation service',()=>{
  Object.assign(global,{__CRAYON_PREPARE_ENDPOINT__:''});
  require('../demo');
  expect(create.mock.calls[0][0].prepareMedia).toBeUndefined();
});

it.each([false,true])('selects the embedded layout before rendering or loading the player bundle (framed=%s)',framed=>{
  const html=readFileSync(join(__dirname,'../index.html'),'utf8');
  const bootstrap=html.match(/<script>([\s\S]*?)<\/script>/)!;
  expect(html.indexOf(bootstrap[0])).toBeLessThan(html.indexOf('<style>'));
  expect(html.indexOf(bootstrap[0])).toBeLessThan(html.indexOf('<body>'));
  for (const path of ['/', '/?embed=1', '/?embed=0', '/parse', '/parse/', '/parse?embed=0']) {
    const location=new URL(path,'https://player.example');
    const self={};
    const root={dataset:{embedded:''}};
    new Function('window','document',bootstrap[1])({location,self,top:framed?{}:self},{documentElement:root});
    expect(root.dataset.embedded).toBe(String(playbackEntry(location.href,framed).embedded));
  }
});

const flushResolution=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
it('searches a title, opens source lines and plays a selected episode',async()=>{
  const media='https://cdn.demo.site/episode.m3u8';
  global.fetch=jest.fn(async(path:string)=>({ok:true,json:async()=>path.startsWith('/api/resolve')
    ? {kind:'search',items:[{id:'ruyi:1',title:'测试影片',year:'2026',sourceName:'如意',remarks:'完结'}]}
    : {title:'测试影片',lines:[{id:'0',name:'HLS',episodes:[{id:'0',title:'第一集',url:media}]}]}})) as jest.Mock;
  require('../demo');
  const field=document.querySelector<HTMLInputElement>('#source-url')!;
  expect(field.type).toBe('text');
  field.value='测试影片';
  document.querySelector('#source-form')!.dispatchEvent(new Event('submit',{cancelable:true}));
  await flushResolution();
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/api/resolve?input=');
  document.querySelector<HTMLButtonElement>('#catalog-results button')!.click();
  await flushResolution();
  expect(document.querySelector('#catalog-results h3')!.textContent).toBe('HLS');
  document.querySelector<HTMLButtonElement>('#catalog-results button')!.click();
  expect(create.mock.calls[1][0]).toMatchObject({url:media,prepareMedia:'/api/player/prepare'});
});
it('resolves an HTML page and loads the returned stream with Crayon instead of an iframe',async()=>{
  const source='https://v.youku.com/v_show/id_XNjU3OTQ2NDMyOA==.html';
  global.fetch=jest.fn(async()=>({ok:true,json:async()=>({url:'https://player.example/api/player/resolved/123.m3u8',type:'m3u8'})})) as jest.Mock;
  window.history.replaceState(null,'','/parse?url='+encodeURIComponent(source));
  require('../demo');
  expect(create).not.toHaveBeenCalled();
  expect(document.querySelector('#status')!.textContent).toContain('正在解析');
  await flushResolution();
  expect(create).toHaveBeenCalledWith(expect.objectContaining({url:'https://player.example/api/player/resolved/123.m3u8',player:{type:'m3u8'},prepareMedia:undefined}));
  expect(document.querySelector('iframe')).toBeNull();
  expect((document.querySelector('#source-url') as HTMLInputElement).value).toBe(source);
});
it('ignores a late HTML resolution after the user switches to a direct stream',async()=>{
  let finish:(value:unknown)=>void=()=>{};
  global.fetch=jest.fn(()=>new Promise(resolve=>{finish=resolve;})) as jest.Mock;
  require('../demo');
  const field=document.querySelector<HTMLInputElement>('#source-url')!;
  field.value='https://www.iqiyi.com/v_nvusov4apo.html';
  document.querySelector('#source-form')!.dispatchEvent(new Event('submit',{cancelable:true}));
  field.value='https://media.example/direct.mp4';
  document.querySelector('#source-form')!.dispatchEvent(new Event('submit',{cancelable:true}));
  finish({ok:true,json:async()=>({url:'https://media.example/late.mp4',type:'mp4'})});
  await flushResolution();
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[1][0].url).toBe(field.value);
});
it('prepares a CMS-matched media URL returned for a video webpage',async()=>{
  const source='https://v.youku.com/v_show/id_a.html';
  global.fetch=jest.fn(async()=>({ok:true,json:async()=>({url:'https://cdn.demo.site/22.m3u8',type:'m3u8',direct:true,provider:'cms',match:{title:'谷雨',episodeTitle:'第22集',sourceName:'如意'}})})) as jest.Mock;
  window.history.replaceState(null,'','/parse?url='+encodeURIComponent(source));
  require('../demo');
  await flushResolution();
  expect(create).toHaveBeenCalledWith(expect.objectContaining({url:'https://cdn.demo.site/22.m3u8',prepareMedia:'/api/player/prepare'}));
  expect(document.querySelector('#status')!.textContent).toContain('谷雨 · 第22集 · 如意');
});
it('passes ranked playback routes to the player source selector',async()=>{
  const routes=[{id:'hd',name:'如意 · 1920×1080 · 80ms',url:'https://player.example/hd.m3u8',type:'m3u8'},{id:'sd',name:'暴风 · 1280×720 · 30ms',url:'https://player.example/sd.m3u8',type:'m3u8'}];
  global.fetch=jest.fn(async()=>({ok:true,json:async()=>({url:routes[0].url,type:'m3u8',direct:false,provider:'cms',routes})})) as jest.Mock;
  window.history.replaceState(null,'','/parse?url='+encodeURIComponent('https://v.youku.com/v_show/id_a.html'));
  require('../demo');
  await flushResolution();
  expect(create.mock.calls[0][0].sources).toEqual(routes);
  create.mock.calls[0][0].onSourceChange(routes[1]);
  expect(document.querySelector('#status')!.textContent).toContain(routes[1].name);
});
it('shows resolver errors as text and explains why static HTML playback needs a server',async()=>{
  require('../demo');
  global.fetch=jest.fn(async()=>({ok:false,json:async()=>({error:{message:'上游视频分片已失效'}})})) as jest.Mock;
  const field=document.querySelector<HTMLInputElement>('#source-url')!;
  field.value='https://www.iqiyi.com/v_nvusov4apo.html';
  document.querySelector('#source-form')!.dispatchEvent(new Event('submit',{cancelable:true}));
  await flushResolution();
  expect(document.querySelector('#status')!.textContent).toBe('上游视频分片已失效');
  expect(create).toHaveBeenCalledTimes(1);
  Object.assign(global,{__CRAYON_PREPARE_ENDPOINT__:''});
  document.querySelector('#source-form')!.dispatchEvent(new Event('submit',{cancelable:true}));
  expect(document.querySelector('#status')!.textContent).toContain('Cloudflare 完整部署');
});
