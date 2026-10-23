import { createMediaPreparer, MediaPreparationError, mediaPreparationNotice } from '../src/media-client';

const result = {url:'https://tv.example/api/player/media?token=clean',type:'application/vnd.apple.mpegurl',filter:{playlist:'',originalDuration:100,removed:[{start:30,end:40}],reason:'filtered'},expiresAt:Date.now()+8*3600000};
const originalFetch = global.fetch;
beforeEach(() => { global.fetch = jest.fn(async () => ({ok:true,json:async()=>result})) as jest.Mock; });
afterEach(() => { global.fetch=originalFetch; jest.restoreAllMocks(); });

it('shares one authenticated preparation between playback and casting and separates ad preferences',async()=>{
  const prepare = createMediaPreparer();
  const first = prepare('https://media.example/1.m3u8',true);
  expect(prepare('https://media.example/1.m3u8',true)).toBe(first);
  await expect(first).resolves.toEqual(result);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledWith('/api/player/prepare',expect.objectContaining({method:'POST',credentials:'same-origin',body:JSON.stringify({url:'https://media.example/1.m3u8',blockAds:true})}));
  await prepare('https://media.example/1.m3u8',false);
  expect(global.fetch).toHaveBeenCalledTimes(2);
});
it('evicts failures and expiring links so a fresh login or preparation can retry',async()=>{
  const prepare = createMediaPreparer();
  jest.mocked(global.fetch).mockResolvedValueOnce({ok:false} as Response);
  await expect(prepare('https://media.example/1.m3u8',true)).rejects.toThrow('登录');
  await expect(prepare('https://media.example/1.m3u8',true)).resolves.toEqual(result);
  jest.spyOn(Date,'now').mockReturnValue(Date.now()+31*60000);
  await prepare('https://media.example/1.m3u8',true);
  expect(global.fetch).toHaveBeenCalledTimes(3);
});
it.each(['javascript:alert(1)','blob:private'])('rejects a non-HTTP media URL: %s',async url=>{
  jest.mocked(global.fetch).mockResolvedValue({ok:true,json:async()=>({...result,url})} as Response);
  await expect(createMediaPreparer()('https://media.example/1.m3u8',true)).rejects.toThrow('无效');
});
it('bounds the cache while browsing episodes',async()=>{
  const prepare = createMediaPreparer();
  for(let i=0;i<13;i++) await prepare(`https://media.example/${i}.m3u8`,true);
  await prepare('https://media.example/0.m3u8',true);
  expect(global.fetch).toHaveBeenCalledTimes(14);
});
it.each([
  {...result,url:undefined},
  {...result,filter:{...result.filter,removed:[{start:40,end:30}]}},
  {...result,expiresAt:Date.now()-1},
])('rejects incomplete, unsafe timeline or expired service responses',async response=>{
  jest.mocked(global.fetch).mockResolvedValue({ok:true,json:async()=>response} as Response);
  await expect(createMediaPreparer()('https://media.example/1.m3u8',true)).rejects.toMatchObject({browserFallback:false});
});

it.each([
  [401,undefined,'登录',false],
  [503,undefined,'未就绪',true],
  [502,{code:'UPSTREAM_TIMEOUT'},'超时',true],
  [502,{code:'UPSTREAM_UNAVAILABLE',upstreamStatus:403},'HTTP 403',true],
  [502,{code:'INVALID_PLAYLIST'},'不是有效',true],
  [502,{code:'INVALID_REQUEST'},'请求无效',false],
])('classifies preparation errors for status=%s, code=%s',async(status,error,message,fallback)=>{
  jest.mocked(global.fetch).mockResolvedValueOnce({ok:false,status,json:async()=>({error})} as Response);
  let failure:unknown;
  try{await createMediaPreparer()('https://media.example/1.m3u8',true);}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(MediaPreparationError);
  expect((failure as MediaPreparationError).browserFallback).toBe(fallback);
  expect(mediaPreparationNotice(failure)).toContain(message);
  expect(mediaPreparationNotice(failure,true)).toContain('Crayon 本地过滤');
});

it('times out stalled preparation and permits local Crayon filtering',async()=>{
  jest.useFakeTimers();
  try{
    jest.mocked(global.fetch).mockImplementationOnce((_url,init)=>new Promise((_resolve,reject)=>{
      init!.signal!.addEventListener('abort',()=>reject(new Error('aborted')));
    }));
    const waiting=expect(createMediaPreparer()('https://media.example/slow.m3u8',true)).rejects.toMatchObject({code:'SERVICE_TIMEOUT',browserFallback:true});
    jest.advanceTimersByTime(20000);
    await waiting;
  }finally{jest.useRealTimers();}
});

it('handles network errors and old plain-text relay failures without exposing provider HTML',async()=>{
  jest.mocked(global.fetch).mockRejectedValueOnce(new TypeError('private request information'));
  await expect(createMediaPreparer()('https://media.example/1.m3u8',true)).rejects.toMatchObject({browserFallback:true,code:'SERVICE_UNREACHABLE'});
  jest.mocked(global.fetch).mockResolvedValueOnce({ok:false,status:502,json:async()=>{throw new Error('HTML');}} as unknown as Response);
  await expect(createMediaPreparer()('https://media.example/1.m3u8',true)).rejects.toMatchObject({browserFallback:true,code:'SERVICE_ERROR'});
});
