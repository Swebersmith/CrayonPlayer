/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { createHmac, webcrypto } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runInThisContext } from 'vm';

import { adFixture } from './__fixtures__/vod-playlist';
import { handleMediaRelay } from '../src/media-relay';

Object.assign(global, runInThisContext('({Response,Request,Headers,ReadableStream,TextEncoder,TextDecoder,btoa,atob})'));
Object.defineProperty(global,'crypto',{value:webcrypto,configurable:true});
const secret = 'player-media-test-secret';
const env = { PASSWORD: secret, STORAGE_TYPE: 'cloudflare-d1' };
const cookie = 'auth=' + encodeURIComponent(JSON.stringify({ username:'viewer',signature:createHmac('sha256',secret).update('viewer').digest('hex') }));
const handlePlayerMedia = (request: Request, environment: typeof env) => handleMediaRelay(request,{secret:environment.PASSWORD,authorize:request=>request.headers.get('cookie')===cookie});
const originalFetch = global.fetch;
let playlist = '';
const rootUrl = 'https://media.example/show/index.m3u8?token=a%2Fb';
beforeEach(() => {
  playlist = adFixture({ key: '#EXT-X-KEY:METHOD=AES-128,URI="keys/key.bin"' });
  global.fetch = jest.fn(async (input: string) => {
    const url = String(input);
    if (/\.m3u8(?:[?#]|$)/.test(url)) return new Response(playlist,{headers:{'Content-Type':'application/vnd.apple.mpegurl'}});
    return new Response(new Uint8Array([1,2,3]),{status:206,headers:{'Content-Type':'video/mp2t','Content-Range':'bytes 0-2/9','Content-Length':'3'}});
  }) as jest.Mock;
});
afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

const prepare = (body: unknown = {url:rootUrl}, auth = cookie) => handlePlayerMedia(new Request('https://tv.example/api/player/prepare',{
  method:'POST',headers:{Cookie:auth,'Content-Type':'application/json'},body:JSON.stringify(body),
}),env);
const get = (url: string, init?: RequestInit) => handlePlayerMedia(new Request(url,init),env);
const grantOf = (url: string) => JSON.parse(Buffer.from(new URL(url).searchParams.get('token')!.split('.')[0],'base64url').toString('utf8'));

it('issues cookie-free filtered playlists, signs every retained segment/key, and preserves original time metadata', async () => {
  const ready = await (await prepare())!.json();
  expect(ready.filter.reason).toBe('filtered');
  expect(ready.filter.removed).toHaveLength(1);
  expect(ready.url).not.toContain(secret);
  const response = (await get(ready.url))!;
  expect(response.status).toBe(200);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  expect(Number(response.headers.get('X-Crayon-Ad-Seconds'))).toBeCloseTo(12.5);
  const content = await response.text();
  const urls = content.split('\n').filter(line => line.startsWith('https://'));
  expect(urls.length).toBe(48);
  const targets = urls.map(grantOf).map(item => item.u);
  expect(targets.some(url => url.includes('insert-'))).toBe(false);
  expect(targets[0]).toContain('/video/before-0.ts');
  expect(content).toMatch(/URI="https:\/\/tv.example\/api\/player\/media\?token=/);
  expect(content).toContain('IV=0x');
});

it('serves a signed ad-free playlist with direct absolute media/key URLs in playlist-only mode', async () => {
  const ready = await (await prepare({url:rootUrl,relayMode:'playlist'}))!.json();
  expect(ready.relayMode).toBe('playlist');
  expect(grantOf(ready.url)).toMatchObject({p:true,m:'p'});
  const response = (await get(ready.url))!;
  const content = await response.text();
  const segments = content.split('\n').filter(line=>line.startsWith('https://'));
  expect(segments).toHaveLength(48);
  expect(segments[0]).toBe('https://media.example/video/before-0.ts');
  expect(content).toContain('URI="https://media.example/show/keys/key.bin"');
  expect(content).toContain('IV=0x');
  expect(content).not.toContain('/api/player/media');
  expect(content).not.toContain('insert-');
  expect(Number(response.headers.get('X-Crayon-Ad-Seconds'))).toBeCloseTo(12.5);
  expect((global.fetch as jest.Mock).mock.calls.map(([url])=>url)).toEqual([rootUrl,rootUrl]);
  const changed = new URL(ready.url);
  const [payload, signature] = changed.searchParams.get('token')!.split('.');
  const grant = JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  delete grant.p;
  changed.searchParams.set('token',Buffer.from(JSON.stringify(grant)).toString('base64url')+'.'+signature);
  expect((await get(changed.href))!.status).toBe(401);
});

it('keeps nested video/audio playlists signed and the same direct-resource policy in playlist-only mode', async () => {
  const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="tracks/audio"\n#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1000,URI="tracks/iframes"\n#EXT-X-STREAM-INF:BANDWIDTH=10000,AUDIO="audio"\ntracks/video\n';
  const media = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MAP:URI="../init.mp4",BYTERANGE="100@0"\n#EXT-X-KEY:METHOD=AES-128,URI="../key.bin",IV=0x00000000000000000000000000000001\n#EXTINF:6,\n#EXT-X-BYTERANGE:200@100\n../all.m4s\n#EXT-X-ENDLIST\n';
  (global.fetch as jest.Mock).mockImplementation(async (url:string)=>new Response(url===rootUrl?master:media));
  const ready = await (await prepare({url:rootUrl,relayMode:'playlist'}))!.json();
  const content = await (await get(ready.url))!.text();
  const nested = [...content.matchAll(/URI="([^"]+)"/g)].map(match=>match[1]);
  nested.push(content.split('\n').find(line=>line.startsWith('https://'))!);
  expect(nested).toHaveLength(3);
  for (const url of nested) {
    expect(new URL(url).origin).toBe('https://tv.example');
    expect(grantOf(url)).toMatchObject({p:true,m:'p',b:false});
    const child = await (await get(url))!.text();
    expect(child).toContain('URI="https://media.example/show/init.mp4"');
    expect(child).toContain('URI="https://media.example/show/key.bin"');
    expect(child).toContain('https://media.example/show/all.m4s');
    expect(child).toContain('#EXT-X-BYTERANGE:200@100');
    expect(child).not.toContain('/api/player/media');
  }
});

it('keeps the ad switch independent and returns MP4 directly without transferring it in playlist-only mode', async () => {
  const ready = await (await prepare({url:rootUrl,relayMode:'playlist',blockAds:false}))!.json();
  expect(await (await get(ready.url))!.text()).toContain('insert-');
  (global.fetch as jest.Mock).mockClear();
  const mp4 = await (await prepare({url:'https://media.example/movie.mp4?token=x',relayMode:'playlist'}))!.json();
  expect(mp4.url).toBe('https://media.example/movie.mp4?token=x');
  expect(mp4.relayMode).toBe('playlist');
  expect(global.fetch).not.toHaveBeenCalled();
});

it('validates relay mode and prevents unsafe resource URLs even when resources are direct', async () => {
  expect(await (await prepare({url:rootUrl,relayMode:'unknown'}))!.json()).toEqual({error:{code:'INVALID_REQUEST'}});
  expect(global.fetch).not.toHaveBeenCalled();
  for (const resource of ['http://127.0.0.1/private.ts','file:///private.ts']) {
    playlist = `#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\n${resource}\n#EXT-X-ENDLIST\n`;
    const ready = await (await prepare({url:rootUrl,relayMode:'playlist',blockAds:false}))!.json();
    expect((await get(ready.url))!.status).toBe(502);
  }
});
it('streams signed media/Range without forwarding website cookies or other client credentials', async () => {
  const ready = await (await prepare())!.json();
  const text = await (await get(ready.url))!.text();
  const segment = text.split('\n').find(line=>line.startsWith('https://'))!;
  const response = (await get(segment,{headers:{Range:'bytes=0-2',Cookie:'private-cookie',Authorization:'private'}}))!;
  expect(response.status).toBe(206);
  expect(response.headers.get('Content-Range')).toBe('bytes 0-2/9');
  expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1,2,3]);
  const forwarded = (global.fetch as jest.Mock).mock.calls.slice(-1)[0][1].headers as Headers;
  expect(forwarded.get('Range')).toBe('bytes=0-2');
  expect(forwarded.get('Cookie')).toBeNull();
  expect(forwarded.get('Authorization')).toBeNull();
});
it('rejects unauthenticated issuance, tampered/expired links, private addresses and private redirects', async () => {
  expect((await prepare(undefined,''))!.status).toBe(401);
  for (const url of ['http://127.0.0.1/a.m3u8','http://169.254.169.254/a.m3u8','http://localhost/a.m3u8','file:///tmp/a']) {
    expect((await prepare({url}))!.status).toBe(502);
  }
  const ready = await (await prepare())!.json();
  const changed = new URL(ready.url);
  const token = changed.searchParams.get('token')!;
  changed.searchParams.set('token',token.slice(0,-1)+(token.endsWith('a')?'b':'a'));
  expect((await get(changed.href))!.status).toBe(401);
  const now = Date.now(); jest.spyOn(Date,'now').mockReturnValue(now + 9 * 60 * 60 * 1000);
  expect((await get(ready.url))!.status).toBe(401);
  jest.restoreAllMocks();
  (global.fetch as jest.Mock).mockResolvedValue(new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}}));
  expect((await prepare())!.status).toBe(502);
});
it('keeps ads when disabled and does not independently cut multi-track master renditions', async () => {
  const ready = await (await prepare({url:rootUrl,blockAds:false}))!.json();
  const text = await (await get(ready.url))!.text();
  expect(text.split('\n').filter(line=>line.startsWith('https://')).map(grantOf).some(item=>item.u.includes('insert-'))).toBe(true);
  playlist = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=10000,AUDIO="audio"\nvideo.m3u8\n';
  const multi = await (await prepare())!.json();
  const master = await (await get(multi.url))!.text();
  const variant = master.split('\n').find(line=>line.startsWith('https://'))!;
  expect(grantOf(variant).b).toBe(false);
});
it('filters the reported Bear episode by 26.04 seconds without changing programme order', async () => {
  playlist = readFileSync(join(__dirname,'__fixtures__/baofeng/bear-episode1.m3u8'),'utf8');
  const ready = await (await prepare())!.json();
  expect(ready.filter.removed).toHaveLength(1);
  expect(ready.filter.removed[0].end-ready.filter.removed[0].start).toBeCloseTo(26.04);
  const expected = playlist.split('\n').filter(line=>line.trim()&&!line.startsWith('#')&&!line.includes('/adjump/')).map(line=>new URL(line,rootUrl).href);
  const actual = (await (await get(ready.url))!.text()).split('\n').filter(line=>line.startsWith('https://')).map(grantOf).map(item=>item.u);
  expect(actual).toEqual(expected);
});

it('prepares the reported non-Baofeng nested master and plays an unmatched playlist intact',async()=>{
  const master=readFileSync(join(__dirname,'__fixtures__/zuid/bear-episode1-master.m3u8'),'utf8');
  const media=readFileSync(join(__dirname,'__fixtures__/zuid/bear-episode1.m3u8'),'utf8');
  const root='https://v14.zuidazym3u8.com/yyv14/202610/01/mDCHrrdDVM27/video/index.m3u8';
  const child=new URL('2000k_1080/hls/index.m3u8',root).href;
  (global.fetch as jest.Mock).mockImplementation(async (input:string)=>new Response(String(input)===root?master:media));
  const preparedResponse=(await prepare({url:root,blockAds:true}))!;
  expect(preparedResponse.status).toBe(200);
  const ready=await preparedResponse.json();
  expect(grantOf(ready.url).u).toBe(child);
  expect(ready.filter).toMatchObject({reason:'no-match',removed:[]});
  expect(ready.filter.originalDuration).toBeCloseTo(809.32);
  const response=(await get(ready.url))!;
  expect(response.status).toBe(200);
  const content=await response.text();
  const expected=media.split('\n').map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
  const actual=content.split('\n').filter(line=>line.startsWith('https://')).map(grantOf).map(item=>item.u);
  expect(actual).toEqual(expected);
  expect(response.headers.get('X-Crayon-Ad-Seconds')).toBe('0');
});

it('distinguishes upstream refusal from an invalid playlist without disclosing response bodies',async()=>{
  (global.fetch as jest.Mock).mockResolvedValueOnce(new Response('private provider explanation',{status:403}));
  const denied=(await prepare())!;
  expect(denied.status).toBe(502);
  expect(await denied.json()).toEqual({error:{code:'UPSTREAM_UNAVAILABLE',upstreamStatus:403}});
  (global.fetch as jest.Mock).mockResolvedValueOnce(new Response('<html>provider challenge</html>'));
  expect(await (await prepare())!.json()).toEqual({error:{code:'INVALID_PLAYLIST'}});
});
