import { readFileSync } from 'fs';
import { join } from 'path';

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

it('authenticates before creating the embedded player and passes the session to its internal library',async()=>{
  const source='https://www.iqiyi.com/v_19rrjaail0.html';
  window.history.replaceState(null,'','/parse?'+new URLSearchParams({url:source}));
  require('../demo'); expect(create).not.toHaveBeenCalled();
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(create).toHaveBeenCalledWith(expect.objectContaining({url:'',prepareMedia:expect.any(Function),library:expect.objectContaining({source,parser:'ql',auth:expect.objectContaining({accessToken:expect.any(Function)})})}));
  expect(document.body.dataset.embedded).toBe('true');
});

it('shows unsafe query errors without creating a player',()=>{
  window.history.replaceState(null,'','/parse?url=javascript:alert(1)');
  require('../demo');
  expect(create).not.toHaveBeenCalled(); expect(document.body.dataset.entryError).toBe('true');
});

it('puts feature configuration on the player rather than adding page-level search/route controls',()=>{
  require('../demo');
  const options=create.mock.calls[0][0];
  expect(options.library.searchEndpoint).toBe('/api/player/search');
  expect(document.querySelector('.parser-menu')).toBeNull();
  expect(document.querySelector('#source-form')).toBeNull();
  const source='https://v.qq.com/x/cover/show/episode.html?token=a+b&part=2';
  const link=new URL(options.library.shareLink(source,'ql'));
  expect(link.pathname).toBe('/parse'); expect(link.searchParams.get('url')).toBe(source);
  expect(link.searchParams.get('parser')).toBe('ql');
});

it('accepts a film name for M1907 links',()=>{
  window.history.replaceState(null,'','/?'+new URLSearchParams({url:'西游记',parser:'m1907'}));
  require('../demo');
  expect(create).toHaveBeenCalledWith(expect.objectContaining({url:'',library:expect.objectContaining({source:'西游记',parser:'m1907'})}));
});

it('keeps static deployments usable while clearly disabling unavailable search/resolver endpoints',()=>{
  Object.assign(global,{__CRAYON_PREPARE_ENDPOINT__:''});
  require('../demo');
  expect(create.mock.calls[0][0].library).toMatchObject({searchEndpoint:false,detailEndpoint:false,resolveEndpoint:false});
});
