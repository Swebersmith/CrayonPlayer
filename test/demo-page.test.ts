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
