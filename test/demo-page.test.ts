import { readFileSync } from 'fs';
import { join } from 'path';

let listeners: {type:string;listener:EventListener}[];
let create: jest.Mock;
const originalFetch = global.fetch;
beforeEach(()=>{
  jest.resetModules();
  const html=readFileSync(join(__dirname,'../index.html'),'utf8');
  document.body.innerHTML=html.split('<body>')[1].split('</body>')[0];
  document.body.removeAttribute('data-embedded');
  document.body.removeAttribute('data-entry-error');
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
  jest.restoreAllMocks();
  global.fetch=originalFetch;
  window.history.replaceState(null,'','/');
  document.body.innerHTML='';
});

it('authenticates before loading embedded media and keeps filtering authenticated',async()=>{
  const source='https://media.example/episode.m3u8?token=a+b&part=2';
  window.history.replaceState(null,'','/parse?'+new URLSearchParams({url:source}));
  require('../demo');
  expect(create).not.toHaveBeenCalled();
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(create).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith(expect.objectContaining({url:source,prepareMedia:expect.any(Function),autoplay:false}));
  expect(document.body.dataset.embedded).toBe('true');
});

it('shows an invalid query error without loading any media',()=>{
  window.history.replaceState(null,'','/parse?url=javascript:alert(1)');
  require('../demo');
  expect(create).not.toHaveBeenCalled();
  expect(document.body.dataset.entryError).toBe('true');
  expect(document.querySelector('#status')!.textContent).toContain('HTTP(S)');
});

it('generates a ready-to-copy link from the homepage without exposing credentials',()=>{
  window.history.replaceState(null,'','/');
  require('../demo');
  const source='https://media.example/episode.m3u8?token=a+b&part=2';
  (document.querySelector('#source') as HTMLInputElement).value=source;
  (document.querySelector('#share-source') as HTMLButtonElement).click();
  const link=document.querySelector('#playback-link') as HTMLInputElement;
  expect(link.hidden).toBe(false);
  expect(new URL(link.value).pathname).toBe('/parse');
  expect(new URL(link.value).searchParams.get('url')).toBe(source);
  expect(new URL(link.value).username).toBe('');
  expect(new URL(link.value).password).toBe('');
  (document.querySelector('#source-form') as HTMLFormElement).dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  expect(create).toHaveBeenLastCalledWith(expect.objectContaining({url:source}));
  expect(create.mock.results[0].value.destroy).toHaveBeenCalledTimes(1);
});
