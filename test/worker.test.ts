/** @jest-environment node */
import { readFileSync } from 'fs';
import { join } from 'path';
import { runInThisContext } from 'vm';
import { adFixture } from './__fixtures__/vod-playlist';

Object.assign(global,runInThisContext('({ReadableStream,WritableStream,TransformStream,TextEncoder,TextDecoder,Request,Response,Headers,Blob,File,MessageEvent,structuredClone,MessageChannel,MessagePort,DOMException,AbortSignal,AbortController,Event,EventTarget})'));
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve('miniflare',{paths:[require.resolve('wrangler/package.json')]}));
const esbuild = require(require.resolve('esbuild',{paths:[require.resolve('wrangler/package.json')]}));
const NativeResponse = runInThisContext('Response');
jest.setTimeout(30000);

it('runs the standalone deployment with public pages/preparation and cookie-free filtered TV media',async()=>{
  const code=esbuild.buildSync({entryPoints:['examples/cloudflare/worker.mjs'],bundle:true,write:false,format:'esm',platform:'browser'}).outputFiles[0].text;
  const fixture=readFileSync(join(__dirname,'__fixtures__/baofeng/bear-episode1.m3u8'),'utf8');
  const assetUrls:string[]=[];
  const runtime=new Miniflare(convertV4MiniflareOptions({cf:false,workers:[{
    name:'crayon-player',
    compatibilityDate:'2026-10-23',modules:true,script:code,
    bindings:{MEDIA_SECRET:'development-media-secret-for-tests'},
    serviceBindings:{ASSETS:(request:Request)=>{
      assetUrls.push(request.url);
      return new NativeResponse(new URL(request.url).pathname==='/'?'<!doctype html><title>Crayon Player</title>':'not found',{status:new URL(request.url).pathname==='/'?200:404});
    }},
    outboundService:(request:Request)=>request.url.includes('.m3u8')
      ?new NativeResponse(fixture,{headers:{'Content-Type':'application/vnd.apple.mpegurl'}})
      :new NativeResponse(new Uint8Array([1,2,3]),{status:206,headers:{'Content-Range':'bytes 0-2/9','Content-Type':'video/mp2t'}}),
  }]}));
  try{
    const gate = await runtime.dispatchFetch('https://player.example/');
    expect(gate.status).toBe(200);
    expect(gate.headers.get('WWW-Authenticate')).toBeNull();
    expect(await gate.text()).toContain('Crayon Player');
    const auth = '';
    for (const path of ['/auth/login', '/auth/logout', '/auth/embed/session', '/api/player/search', '/api/player/detail']) {
      expect((await runtime.dispatchFetch('https://player.example' + path)).status).toBe(404);
    }
    expect((await runtime.dispatchFetch('https://player.example/',{headers:{Cookie:auth}})).status).toBe(200);
    expect(await (await runtime.dispatchFetch('https://player.example/parse?url=https%3A%2F%2Fmedia.example%2Fepisode.m3u8')).text()).toContain('Crayon Player');
    for(const path of ['/parse','/parse/']){
      const parsed=await runtime.dispatchFetch('https://player.example'+path+'?url=https%3A%2F%2Fmedia.example%2Fepisode.m3u8',{headers:{Cookie:auth}});
      expect(parsed.status).toBe(200);
      expect(parsed.headers.get('location')).toBeNull();
      expect(parsed.headers.get('cache-control')).toBe('private, no-store');
      expect(await parsed.text()).toContain('Crayon Player');
      expect(assetUrls[assetUrls.length-1]).toBe('https://player.example/');
    }
    const prepare=(cookie:string)=>runtime.dispatchFetch('https://player.example/api/player/prepare',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({url:'https://media.example/episode.m3u8',blockAds:true})});
    expect((await prepare('')).status).toBe(200);
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
  const runtime=new Miniflare(convertV4MiniflareOptions({cf:false,workers:[{
    name:'crayon-zuid',compatibilityDate:'2026-10-23',modules:true,script:code,
    bindings:{MEDIA_SECRET:'development-media-secret-for-tests'},
    serviceBindings:{ASSETS:()=>new NativeResponse('Crayon Player')},
    outboundService:(request:Request)=>request.url.includes('/blocked/')
      ?new NativeResponse('provider refused',{status:403})
      :new NativeResponse(request.url.includes('/2000k_1080/')?media:master),
  }]}));
  try{
    const auth = '';
    const prepare=(url:string)=>runtime.dispatchFetch('https://player.example/api/player/prepare',{method:'POST',headers:{Cookie:auth,'Content-Type':'application/json'},body:JSON.stringify({url,blockAds:true})});
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

it('serves a cookie-free filtered casting playlist while leaving media and AES keys direct in workerd', async () => {
  const code = esbuild.buildSync({entryPoints:['examples/cloudflare/worker.mjs'],bundle:true,write:false,format:'esm',platform:'browser'}).outputFiles[0].text;
  const fixture = adFixture({key:'#EXT-X-KEY:METHOD=AES-128,URI="keys/program.key"'});
  const upstreamUrls: string[] = [];
  const runtime = new Miniflare(convertV4MiniflareOptions({cf:false,workers:[{
    name:'crayon-playlist-only',compatibilityDate:'2026-10-23',modules:true,script:code,
    bindings:{MEDIA_SECRET:'development-media-secret-for-tests'},
    serviceBindings:{ASSETS:()=>new NativeResponse('Crayon Player')},
    outboundService:(request:Request)=>{
      upstreamUrls.push(request.url);
      return new NativeResponse(fixture,{headers:{'Content-Type':'application/vnd.apple.mpegurl'}});
    },
  }]}));
  try {
    const auth = '';
    const root = 'https://media.example/show/index.m3u8';
    const response = await runtime.dispatchFetch('https://player.example/api/player/prepare',{
      method:'POST',headers:{Cookie:auth,'Content-Type':'application/json'},
      body:JSON.stringify({url:root,blockAds:true,relayMode:'playlist'}),
    });
    expect(response.status).toBe(200);
    const ready = await response.json();
    expect(ready.relayMode).toBe('playlist');
    expect(ready.filter.reason).toBe('filtered');
    const media = await runtime.dispatchFetch(ready.url);
    expect(media.status).toBe(200);
    expect(media.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const playlist = await media.text();
    expect(playlist).not.toContain('/api/player/media');
    expect(playlist).not.toContain('insert-');
    expect(playlist).toContain('URI="https://media.example/show/keys/program.key"');
    expect(playlist).toContain('IV=0x');
    expect(playlist.split('\n').filter((line:string)=>line.startsWith('https://'))).toHaveLength(48);
    expect(upstreamUrls).toEqual([root,root]);
    const head = await runtime.dispatchFetch(ready.url,{method:'HEAD'});
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  } finally { await runtime.dispose(); }
});


it('serves the page without secrets and requires a signing key only for media requests', async () => {
  const code = esbuild.buildSync({entryPoints:['examples/cloudflare/worker.mjs'],bundle:true,write:false,format:'esm',platform:'browser'}).outputFiles[0].text;
  const runtime = new Miniflare(convertV4MiniflareOptions({cf:false,workers:[{
    name:'crayon-no-secrets',compatibilityDate:'2026-10-23',modules:true,script:code,
    serviceBindings:{ASSETS:()=>new NativeResponse('Crayon Player')},
  }]}));
  try {
    expect((await runtime.dispatchFetch('https://player.example/')).status).toBe(200);
    expect((await runtime.dispatchFetch('https://player.example/api/player/prepare', {method:'POST'})).status).toBe(503);
  } finally { await runtime.dispose(); }
});

it('resolves HTML pages into signed Crayon HLS/MP4 streams, snapshots playlists and rejects stale image fragments',async()=>{
  const code=esbuild.buildSync({entryPoints:['examples/cloudflare/worker.mjs'],bundle:true,write:false,format:'esm',platform:'browser'}).outputFiles[0].text;
  let kind='hls',manifestReads=0;
  const bytes=new Uint8Array(1280);bytes.fill(71,16);
  const playlist='#EXTM3U\n#EXT-X-TARGETDURATION:8\n#EXTINF:8,\n#EXT-X-BYTERANGE:1264@16\nhttps://new-cdn.onewsvod.com/wrapped.png\n#EXT-X-ENDLIST';
  const runtime=new Miniflare(convertV4MiniflareOptions({cf:false,workers:[{
    name:'crayon-html-resolver',compatibilityDate:'2026-10-23',modules:true,script:code,
    bindings:{MEDIA_SECRET:'development-media-secret-for-tests'},
    serviceBindings:{ASSETS:()=>new NativeResponse('Crayon Player')},
    outboundService:(request:Request)=>{
      const u=new URL(request.url);
      expect(request.headers.get('cookie')).toBeNull();
      if(u.hostname==='svip.qlplayer.cyou'){
        if(u.pathname==='/')return new NativeResponse('apiToken: "temporary-page-ticket"');
        expect(u.searchParams.get('token')).toBe('temporary-page-ticket');
        return new NativeResponse(JSON.stringify({code:200,type:kind==='mp4'?'auto':'m3u8',url:'https://new-cdn.onewsvod.com/'+(kind==='mp4'?'movie':'index.m3u8')}));
      }
      if(u.pathname==='/index.m3u8'){manifestReads++;return new NativeResponse(playlist);}
      if(u.pathname==='/movie')return new NativeResponse(new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]),{status:206,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 0-11/12'}});
      // Ignore Range like an image CDN: the relay must return the exact byte slice.
      return new NativeResponse(kind==='stale'?new Uint8Array(204):bytes,{headers:{'Content-Length':kind==='stale'?'204':String(bytes.length)}});
    },
  }]}));
  const resolve=()=>runtime.dispatchFetch('https://player.example/api/player/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parser:'ql',url:'https://v.youku.com/v_show/id_XNjU3OTQ2NDMyOA==.html'})});
  try{
    const result=await resolve();expect(result.status).toBe(200);
    const ready=await result.json();expect(ready.type).toBe('m3u8');
    expect(ready.url).toContain('/api/player/resolved/');
    const cached=await runtime.dispatchFetch(ready.url);expect(cached.status).toBe(200);
    const manifest=await cached.text();expect(manifestReads).toBe(1);
    const media=manifest.split('\n').find((line:string)=>line.startsWith('https://'))!;
    const part=await runtime.dispatchFetch(media,{headers:{Range:'bytes=16-1279'}});
    expect(part.status).toBe(206);expect(part.headers.get('content-range')).toBe('bytes 16-1279/1280');
    expect(new Uint8Array(await part.arrayBuffer())).toHaveLength(1264);
    expect((await runtime.dispatchFetch(media.replace('wrapped.png','tampered.png'))).status).toBe(403);
    kind='stale';const stale=await resolve();expect(stale.status).toBe(502);
    expect((await stale.json()).error).toMatchObject({code:'STALE_MEDIA'});
    kind='mp4';const file=await (await resolve()).json();expect(file.type).toBe('mp4');expect(file.url).toContain('/api/player/resolved-media?');
    expect((await runtime.dispatchFetch('https://player.example/api/player/resolve',{method:'POST',headers:{'Origin':'https://evil.example','Content-Type':'application/json'},body:'{}'})).status).toBe(403);
  }finally{await runtime.dispose();}
});
