/** @jest-environment node */
import { readFileSync } from 'fs';
import { join } from 'path';
import { runInThisContext } from 'vm';

Object.assign(global,runInThisContext('({ReadableStream,WritableStream,TransformStream,TextEncoder,TextDecoder,Request,Response,Headers,Blob,File,MessageEvent,structuredClone,MessageChannel,MessagePort,DOMException,AbortSignal,AbortController,Event,EventTarget})'));
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve('miniflare',{paths:[require.resolve('wrangler/package.json')]}));
const esbuild = require(require.resolve('esbuild',{paths:[require.resolve('wrangler/package.json')]}));
const NativeResponse = runInThisContext('Response');
jest.setTimeout(30000);

it('runs the standalone deployment with authenticated pages/preparation and cookie-free filtered TV media',async()=>{
  const code=esbuild.buildSync({entryPoints:['examples/cloudflare/worker.mjs'],bundle:true,write:false,format:'esm',platform:'browser'}).outputFiles[0].text;
  const fixture=readFileSync(join(__dirname,'__fixtures__/baofeng/bear-episode1.m3u8'),'utf8');
  const assetUrls:string[]=[];
  const runtime=new Miniflare(convertV4MiniflareOptions({workers:[{
    name:'crayon-player',
    compatibilityDate:'2026-10-23',modules:true,script:code,
    bindings:{MEDIA_SECRET:'development-media-secret-for-tests',VIEWER_PASSWORD:'viewer-password'},
    serviceBindings:{ASSETS:(request:Request)=>{
      assetUrls.push(request.url);
      return new NativeResponse(new URL(request.url).pathname==='/'?'<!doctype html><title>Crayon Player</title>':'not found',{status:new URL(request.url).pathname==='/'?200:404});
    }},
    outboundService:(request:Request)=>request.url.includes('.m3u8')
      ?new NativeResponse(fixture,{headers:{'Content-Type':'application/vnd.apple.mpegurl'}})
      :new NativeResponse(new Uint8Array([1,2,3]),{status:206,headers:{'Content-Range':'bytes 0-2/9','Content-Type':'video/mp2t'}}),
  }]}));
  try{
    expect((await runtime.dispatchFetch('https://player.example/')).status).toBe(401);
    const auth='Basic '+Buffer.from('crayon:viewer-password').toString('base64');
    expect((await runtime.dispatchFetch('https://player.example/',{headers:{Authorization:auth}})).status).toBe(200);
    expect((await runtime.dispatchFetch('https://player.example/parse?url=https%3A%2F%2Fmedia.example%2Fepisode.m3u8')).status).toBe(401);
    for(const path of ['/parse','/parse/']){
      const parsed=await runtime.dispatchFetch('https://player.example'+path+'?url=https%3A%2F%2Fmedia.example%2Fepisode.m3u8',{headers:{Authorization:auth}});
      expect(parsed.status).toBe(200);
      expect(parsed.headers.get('location')).toBeNull();
      expect(parsed.headers.get('cache-control')).toBe('private, no-store');
      expect(await parsed.text()).toContain('Crayon Player');
      expect(assetUrls[assetUrls.length-1]).toBe('https://player.example/');
    }
    const prepare=(authorization:string)=>runtime.dispatchFetch('https://player.example/api/player/prepare',{method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify({url:'https://media.example/episode.m3u8',blockAds:true})});
    expect((await prepare('Basic '+Buffer.from('crayon:wrong').toString('base64'))).status).toBe(401);
    const ready=await (await prepare(auth)).json();
    expect(ready.filter.removed[0].end-ready.filter.removed[0].start).toBeCloseTo(26.04);
    const media=await runtime.dispatchFetch(ready.url);
    expect(media.status).toBe(200);
    const playlist=await media.text();
    const duration=(text:string)=>Array.from(text.matchAll(/#EXTINF:([\d.]+)/g)).reduce((sum,match)=>sum+Number(match[1]),0);
    expect(duration(fixture)-duration(playlist)).toBeCloseTo(26.04);
    const segment=playlist.split('\n').find((line:string)=>line.startsWith('https://'));
    const bytes=await runtime.dispatchFetch(segment,{headers:{Range:'bytes=0-2'}});
    expect(bytes.status).toBe(206);
    expect(Array.from(new Uint8Array(await bytes.arrayBuffer()))).toEqual([1,2,3]);
    expect((await runtime.dispatchFetch('https://player.example/api/player/media?token=wrong')).status).toBe(401);
  }finally{await runtime.dispose();}
});

it('runs non-Baofeng nested playlists and distinguishes blocked upstreams in workerd',async()=>{
  const code=esbuild.buildSync({entryPoints:['examples/cloudflare/worker.mjs'],bundle:true,write:false,format:'esm',platform:'browser'}).outputFiles[0].text;
  const master=readFileSync(join(__dirname,'__fixtures__/zuid/bear-episode1-master.m3u8'),'utf8');
  const media=readFileSync(join(__dirname,'__fixtures__/zuid/bear-episode1.m3u8'),'utf8');
  const runtime=new Miniflare(convertV4MiniflareOptions({workers:[{
    name:'crayon-zuid',compatibilityDate:'2026-10-23',modules:true,script:code,
    bindings:{MEDIA_SECRET:'development-media-secret-for-tests',VIEWER_PASSWORD:'viewer-password'},
    serviceBindings:{ASSETS:()=>new NativeResponse('Crayon Player')},
    outboundService:(request:Request)=>request.url.includes('/blocked/')
      ?new NativeResponse('provider refused',{status:403})
      :new NativeResponse(request.url.includes('/2000k_1080/')?media:master),
  }]}));
  try{
    const auth='Basic '+Buffer.from('crayon:viewer-password').toString('base64');
    const prepare=(url:string)=>runtime.dispatchFetch('https://player.example/api/player/prepare',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({url,blockAds:true})});
    const response=await prepare('https://media.example/show/index.m3u8');
    expect(response.status).toBe(200);
    const ready=await response.json();
    expect(ready.filter).toMatchObject({reason:'no-match',removed:[]});
    expect(ready.filter.originalDuration).toBeCloseTo(809.32);
    const content=await (await runtime.dispatchFetch(ready.url)).text();
    const segments=content.split('\n').filter((line:string)=>line.startsWith('https://'));
    expect(segments).toHaveLength(media.split('\n').filter(line=>line.startsWith('https://')).length);
    expect(await (await prepare('https://media.example/blocked/index.m3u8')).json()).toEqual({error:{code:'UPSTREAM_UNAVAILABLE',upstreamStatus:403}});
  }finally{await runtime.dispose();}
});
