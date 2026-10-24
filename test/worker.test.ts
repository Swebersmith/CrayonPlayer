/** @jest-environment node */
import { readFileSync } from 'fs';
import { join } from 'path';
import { runInThisContext } from 'vm';

Object.assign(global,runInThisContext('({ReadableStream,WritableStream,TransformStream,TextEncoder,TextDecoder,Request,Response,Headers,Blob,File,MessageEvent,structuredClone,MessageChannel,MessagePort,DOMException,AbortSignal,AbortController,Event,EventTarget})'));
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve('miniflare',{paths:[require.resolve('wrangler/package.json')]}));
const esbuild = require(require.resolve('esbuild',{paths:[require.resolve('wrangler/package.json')]}));
const NativeResponse = runInThisContext('Response');
jest.setTimeout(30000);

const login = (runtime:any, password = 'viewer-password', returnTo = '/', origin = 'https://player.example') => runtime.dispatchFetch('https://player.example/auth/login', {
  method: 'POST', redirect: 'manual', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ password, returnTo }).toString(),
});
async function loginCookie(runtime:any) {
  const response = await login(runtime);
  expect(response.status).toBe(303);
  return response.headers.get('Set-Cookie')!.split(';')[0];
}

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
    const gate = await runtime.dispatchFetch('https://player.example/');
    expect(gate.status).toBe(200);
    expect(gate.headers.get('WWW-Authenticate')).toBeNull();
    expect(await gate.text()).toContain('name="password"');
    const auth = await loginCookie(runtime);
    expect((await runtime.dispatchFetch('https://player.example/',{headers:{Cookie:auth}})).status).toBe(200);
    expect(await (await runtime.dispatchFetch('https://player.example/parse?url=https%3A%2F%2Fmedia.example%2Fepisode.m3u8')).text()).toContain('输入访问密码');
    for(const path of ['/parse','/parse/']){
      const parsed=await runtime.dispatchFetch('https://player.example'+path+'?url=https%3A%2F%2Fmedia.example%2Fepisode.m3u8',{headers:{Cookie:auth}});
      expect(parsed.status).toBe(200);
      expect(parsed.headers.get('location')).toBeNull();
      expect(parsed.headers.get('cache-control')).toBe('private, no-store');
      expect(await parsed.text()).toContain('Crayon Player');
      expect(assetUrls[assetUrls.length-1]).toBe('https://player.example/');
    }
    const prepare=(cookie:string)=>runtime.dispatchFetch('https://player.example/api/player/prepare',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({url:'https://media.example/episode.m3u8',blockAds:true})});
    const denied = await prepare('');
    expect(denied.status).toBe(401);
    expect(denied.headers.get('WWW-Authenticate')).toBeNull();
    expect(await denied.json()).toEqual({ error: { code: 'UNAUTHORIZED' } });
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
    const auth = await loginCookie(runtime);
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

function authRuntime(password = 'viewer-password', clockOffset = 0) {
  const code = esbuild.buildSync({ entryPoints: ['examples/cloudflare/worker.mjs'], bundle: true, write: false, format: 'esm', platform: 'browser' }).outputFiles[0].text;
  return new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'crayon-auth', compatibilityDate: '2026-10-23', modules: true,
    script: (clockOffset ? `Date.now = () => ${Date.now() + clockOffset};\n` : '') + code,
    bindings: { MEDIA_SECRET: 'development-media-secret-for-tests', VIEWER_PASSWORD: password },
    serviceBindings: { ASSETS: () => new NativeResponse('<!doctype html><title>Authenticated player</title>') },
  }] }));
}

it('uses a password-only form, preserves deep links and protects cookies and login redirects', async () => {
  const runtime = authRuntime();
  try {
    const target = '/parse?url=https%3A%2F%2Fmedia.example%2Fvideo.m3u8%3Ftoken%3Da%26part%3D2&embed=0';
    const gate = await runtime.dispatchFetch('https://player.example' + target);
    const html = await gate.text();
    expect(html).toContain('type="password"');
    expect(html).not.toContain('name="username"');
    expect(html).not.toContain('viewer-password');
    expect(html).toContain(target.replace(/&/g, '&amp;'));
    expect(gate.headers.get('Cache-Control')).toBe('private, no-store');
    const bad = await login(runtime, 'wrong', target);
    expect(bad.status).toBe(401);
    expect(bad.headers.get('Set-Cookie')).toBeNull();
    expect(bad.headers.get('WWW-Authenticate')).toBeNull();
    expect(await bad.text()).toContain('密码不正确');
    expect((await login(runtime, 'viewer-password', target, 'https://evil.example')).status).toBe(403);
    const success = await login(runtime, 'viewer-password', target);
    expect(success.status).toBe(303);
    expect(success.headers.get('Location')).toBe(target);
    const setCookie = success.headers.get('Set-Cookie')!;
    expect(setCookie).toMatch(/^__Host-crayon-session=/);
    for (const flag of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=43200']) expect(setCookie).toContain(flag);
    expect(setCookie).not.toContain('Domain=');
    expect(setCookie).not.toContain('viewer-password');
    const cookie = setCookie.split(';')[0];
    const page = await runtime.dispatchFetch('https://player.example' + target, { headers: { Cookie: cookie } });
    expect(await page.text()).toContain('Authenticated player');
    const tampered = cookie.slice(0, -1) + (cookie.endsWith('0') ? '1' : '0');
    expect(await (await runtime.dispatchFetch('https://player.example/', { headers: { Cookie: tampered } })).text()).toContain('输入访问密码');
    expect(await (await runtime.dispatchFetch('https://other.example/', { headers: { Cookie: cookie } })).text()).toContain('输入访问密码');
    for (const unsafe of ['//evil.example/', 'https://evil.example/', '/foo/..//evil.example/', '/auth/login']) {
      expect((await login(runtime, 'viewer-password', unsafe)).headers.get('Location')).toBe('/');
    }
    const legacy = await runtime.dispatchFetch('https://player.example/', { headers: { Authorization: 'Basic ' + Buffer.from('crayon:viewer-password').toString('base64') } });
    expect(await legacy.text()).toContain('输入访问密码');
    const crossLogout = await runtime.dispatchFetch('https://player.example/auth/logout', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.example' } });
    expect(crossLogout.status).toBe(403);
    const logout = await runtime.dispatchFetch('https://player.example/auth/logout', { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: 'https://player.example' } });
    expect(logout.status).toBe(303);
    expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((await runtime.dispatchFetch('https://player.example/auth/logout')).status).toBe(405);
    const oversized = await runtime.dispatchFetch('https://player.example/auth/login', { method: 'POST', headers: { Origin: 'https://player.example', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=' + 'x'.repeat(32769) });
    expect(oversized.status).toBe(400);
  } finally { await runtime.dispose(); }
});

it('rejects expired sessions and invalidates sessions when the access password changes', async () => {
  const runtime = authRuntime();
  const oldClock = authRuntime('viewer-password', -13 * 60 * 60 * 1000);
  const rotated = authRuntime('new-viewer-password');
  try {
    const expired = await loginCookie(oldClock);
    expect(await (await runtime.dispatchFetch('https://player.example/', { headers: { Cookie: expired } })).text()).toContain('输入访问密码');
    const cookie = await loginCookie(runtime);
    expect(await (await rotated.dispatchFetch('https://player.example/', { headers: { Cookie: cookie } })).text()).toContain('输入访问密码');
    expect((await login(rotated, 'viewer-password')).status).toBe(401);
    expect((await login(rotated, 'new-viewer-password')).status).toBe(303);
  } finally { await Promise.all([runtime.dispose(), oldClock.dispose(), rotated.dispose()]); }
});
