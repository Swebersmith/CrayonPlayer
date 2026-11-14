const BASE='https://svip.qlplayer.cyou/';
const enc=new TextEncoder();
const fail=(message,status=502)=>Object.assign(new Error(message),{status});
// Only the resolver and its signed playlists can issue relay capabilities.
// A caller cannot turn this into an arbitrary-URL proxy by changing the URL.
export function allowed(raw){
 const u=new URL(raw);const host=u.hostname.toLowerCase().replace(/\.$/,'');
 const domain=/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host);
 const internal=/(?:^|\.)(localhost|local|internal|intranet|lan|home|test|invalid|example|onion)$/.test(host)||host==='metadata.google.internal'||host.endsWith('.workers.dev');
 if(u.protocol!=='https:'||u.port||u.username||u.password||!domain||internal)throw fail('媒体地址不符合公网 HTTPS 地址要求',400);
 return u;
}
export function normalize(raw){
 let u;try{u=new URL(raw.trim());for(let i=0;i<4&&u.hostname==='svip.qlplayer.cyou';i++)u=new URL(u.searchParams.get('url'));}catch{throw fail('请输入完整的视频页面链接',400);}
 const sources={
  'v.qq.com':/^\/x\/(cover|page)\//,
  'v.youku.com':/^\/v_show\/id_[A-Za-z0-9=]+\.html$/,
  'www.iqiyi.com':/^\/(v_|w_|a_)/,
  'm.iqiyi.com':/^\/(v_|w_|a_)/,
  'www.mgtv.com':/^\/(b|h|l)\//,
  'm.mgtv.com':/^\/(b|h|l)\//,
  'www.bilibili.com':/^\/(video|bangumi\/play)\//,
  'm.bilibili.com':/^\/(video|bangumi\/play)\//
 };
 if(u.protocol!=='https:'||u.username||u.password||u.port||!sources[u.hostname]?.test(u.pathname))throw fail('请使用腾讯视频、优酷、爱奇艺、芒果TV或哔哩哔哩的 HTTPS 视频页面链接',400);
 return u.href;
}
async function bounded(response,max=4*1024*1024){if(!response.ok)throw fail('上游返回 HTTP '+response.status);const reader=response.body.getReader();const chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw fail('上游响应过大');chunks.push(value);}}finally{await reader.cancel();}const out=new Uint8Array(size);let p=0;for(const c of chunks){out.set(c,p);p+=c.length;}return new TextDecoder().decode(out);}
async function upstream(url,headers={},media=false){for(let hop=0;hop<4;hop++){if(media){allowed(url);headers={...headers};delete headers.Referer;}const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 CrayonPlayer/0.3',...headers},redirect:'manual',signal:AbortSignal.timeout(25000)});if([301,302,303,307,308].includes(r.status)){const location=r.headers.get('location');await r.body?.cancel();if(!location)throw fail('上游重定向缺少地址');url=new URL(location,url).href;if(!media&&new URL(url).origin!==new URL(BASE).origin)throw fail('解析服务跳转到其他域名');continue;}return r;}throw fail('上游重定向过多');}
export async function mediaRange(response,range){
 if(!range)return response;
 const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match)throw fail('不支持此 Range 请求',400);
 const start=Number(match[1]),requestedEnd=match[2]?Number(match[2]):null;
 if(!Number.isSafeInteger(start)||(requestedEnd!==null&&(!Number.isSafeInteger(requestedEnd)||requestedEnd<start)))throw fail('分片范围无效',400);
 if(response.status===206){
  const m=/^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(response.headers.get('content-range')||'');
  if(!m||Number(m[1])!==start||(requestedEnd!==null&&Number(m[2])<requestedEnd)){
   await response.body?.cancel();throw fail('上游视频分片已失效：返回的字节范围不足');
  }
  return response;
 }
 if(response.status!==200)return response;
 const length=response.headers.get('content-length');const total=length===null?null:Number(length);
 if(total!==null&&(start>=total||(requestedEnd!==null&&requestedEnd>=total))){await response.body?.cancel();throw fail('上游视频分片已失效：文件长度不足，可能已被替换为图片');}
 const end=requestedEnd??(total!==null?total-1:null);let skip=start,left=end===null?Infinity:end-start+1;
 const reader=response.body.getReader();
 const stream=new ReadableStream({async pull(controller){try{while(true){if(left===0){await reader.cancel();controller.close();return;}const {done,value}=await reader.read();if(done){if(Number.isFinite(left)&&left>0)throw fail('上游视频分片传输中断');controller.close();return;}if(skip>=value.length){skip-=value.length;continue;}const chunk=value.subarray(skip,Math.min(value.length,skip+left));skip=0;left-=chunk.length;controller.enqueue(chunk);return;}}catch(e){await reader.cancel().catch(()=>{});controller.error(e);}},cancel(reason){return reader.cancel(reason);}});
 const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-range');headers.set('accept-ranges','bytes');
 if(end!==null){headers.set('content-length',String(end-start+1));headers.set('content-range',`bytes ${start}-${end}/${total??'*'}`);}
 return new Response(stream,{status:end!==null?206:200,headers});
}
async function validateFirstSegment(text,base,depth=0){
 if(depth>3)throw fail('播放列表嵌套过深');
 const lines=text.split(/\r?\n/);let rangeLength=null,offset=0;const master=/#EXT-X-STREAM-INF:/.test(text);
 for(let line of lines){line=line.trim();if(!line)continue;
  if(line.startsWith('#EXT-X-BYTERANGE:')){const m=/^#EXT-X-BYTERANGE:(\d+)(?:@(\d+))?$/.exec(line);if(m){rangeLength=Number(m[1]);offset=m[2]?Number(m[2]):0;}continue;}
  if(line.startsWith('#'))continue;
  const target=new URL(line,base).href;
  if(master){const child=await bounded(await upstream(target,{},true));return validateFirstSegment(child,target,depth+1);}
  const length=rangeLength===null?1024:Math.min(1024,rangeLength),end=offset+length-1;
  const range=`bytes=${offset}-${end}`;const raw=await upstream(target,{Range:range},true);
  if(!raw.ok){await raw.body?.cancel();throw fail('上游视频分片返回 HTTP '+raw.status);}
  const response=await mediaRange(raw,range);const reader=response.body.getReader();let size=0;
  try{while(size<length){const {done,value}=await reader.read();if(done)break;size+=value.length;}}finally{await reader.cancel();}
  if(size<length)throw fail('上游视频分片已失效：实际内容不足，无法播放');
  return;
 }
 throw fail('播放列表中没有可用视频分片');
}
async function key(env){return crypto.subtle.importKey('raw',enc.encode(env.secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
async function relay(url,origin,env,expires){allowed(url);const u=new URL('/api/player/resolved-media',origin);u.searchParams.set('url',url);u.searchParams.set('exp',expires);const sig=await crypto.subtle.sign('HMAC',await key(env),enc.encode(expires+'\n'+url));u.searchParams.set('sig',hex(sig));return u.href;}
async function verify(u,env){const exp=u.searchParams.get('exp'),url=u.searchParams.get('url'),sig=u.searchParams.get('sig')||'';if(!/^\d+$/.test(exp||'')||Number(exp)<Date.now()/1000||Number(exp)>Date.now()/1000+7500||!/^[a-f0-9]{64}$/.test(sig))throw fail('播放凭据已过期，请重新解析',403);allowed(url);const bytes=Uint8Array.from(sig.match(/../g),v=>parseInt(v,16));if(!await crypto.subtle.verify('HMAC',await key(env),bytes,enc.encode(exp+'\n'+url)))throw fail('播放凭据无效',403);return {url,exp};}
export async function rewrite(text,base,origin,env,exp){if(!text.trim().startsWith('#EXTM3U'))throw fail('上游未返回 HLS 播放列表');const lines=[];for(let line of text.split(/\r?\n/)){if(line&&!line.startsWith('#'))line=await relay(new URL(line,base).href,origin,env,exp);else if(line.includes('URI="')){const hits=[...line.matchAll(/URI="([^"]+)"/g)];for(const m of hits)line=line.replace(m[0],'URI="'+await relay(new URL(m[1],base).href,origin,env,exp)+'"');}lines.push(line);}return lines.join('\n');}
const mediaCors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Range, If-Range','Access-Control-Expose-Headers':'Content-Length, Content-Range, Accept-Ranges'};
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function handleParserResolver(request,env){const u=new URL(request.url);if(!['/api/player/resolve','/api/player/resolved-media'].includes(u.pathname)&&!u.pathname.startsWith('/api/player/resolved/'))return null;try{
 if(request.method==='OPTIONS'&&u.pathname!=='/api/player/resolve')return new Response(null,{status:204,headers:mediaCors});
 if(['GET','POST'].includes(request.method)&&u.pathname==='/api/player/resolve'){
  if(!await env.authorize(request))throw fail('无权访问解析服务',401);
  if(!env.secret)throw fail('请配置 MEDIA_SECRET',503);
  if(request.headers.get('origin')&&request.headers.get('origin')!==u.origin)throw fail('请求来源不匹配',403);
  if(Number(request.headers.get('content-length'))>4096)throw fail('请求过大',413);
  let data;if(request.method==='GET'){if(request.headers.get('Sec-Fetch-Site')==='cross-site')throw fail('请求来源不匹配',403);data={url:u.searchParams.get('url')};}else{const body=await bounded(new Response(request.body),4096);try{data=JSON.parse(body);}catch{throw fail('请求格式错误',400);}}
  if(data.parser!==undefined&&data.parser!=='ql')throw fail('未知解析线路',400);
  const source=normalize(data.url);const page=BASE+'?url='+encodeURIComponent(source);
  const html=await bounded(await upstream(page));const m=html.match(/apiToken\s*:\s*("(?:\\.|[^"\\])*")/);
  if(!m)throw fail('解析服务未提供凭据，可能已调整授权规则');
  const token=JSON.parse(m[1]);const parsed=JSON.parse(await bounded(await upstream(BASE+'api/resolve.php?token='+encodeURIComponent(token),{Referer:page})));
  if(parsed.code!==200||!parsed.url)throw fail(parsed.msg||'上游解析失败');
  const original=allowed(parsed.url).href;
  const exp=String(Math.floor(Date.now()/1000)+7200);
  let isHls=parsed.type==='m3u8'||/\.m3u8(?:\?|$)/i.test(original);
  if(!isHls){
   const probe=await upstream(original,{Referer:page,Range:'bytes=0-1023'},true);
   if(!probe.ok){await probe.body?.cancel();throw fail('媒体服务器返回 HTTP '+probe.status);}
   const type=(probe.headers.get('content-type')||'').toLowerCase();
   const reader=probe.body.getReader();let first;
   try{first=(await reader.read()).value||new Uint8Array();}finally{await reader.cancel();}
   const head=new TextDecoder().decode(first.subarray(0,128)).trimStart();
   isHls=/mpegurl/.test(type)||head.startsWith('#EXTM3U');
   const mp4=type.includes('video/mp4')||(first.length>=8&&String.fromCharCode(...first.subarray(4,8))==='ftyp');
   if(!isHls){if(!mp4)throw fail('解析结果暂不是可播放的 HLS 或 MP4 视频');return json({url:await relay(original,u.origin,env,exp),type:'mp4',expiresAt:Number(exp)*1000,source});}
  }
  const manifest=await bounded(await upstream(original,{Referer:page},true));
  await validateFirstSegment(manifest,original);
  const rewritten=await rewrite(manifest,original,u.origin,env,exp);
  const id=crypto.randomUUID();const manifestUrl=new URL('/api/player/resolved/'+id+'.m3u8',u.origin).href;
  // Opaque, short-lived cache entry; eviction is reported explicitly to the player.
  await caches.default.put(new Request(manifestUrl),new Response(rewritten,{headers:{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'public, max-age=7200'}}));
  console.log(JSON.stringify({event:'resolve',ok:true}));
  return json({url:manifestUrl,type:'m3u8',expiresAt:Number(exp)*1000,source});
 }
 if(['GET','HEAD'].includes(request.method)&&/^\/api\/player\/resolved\/[a-f0-9-]+\.m3u8$/.test(u.pathname)){
  const r=await caches.default.match(new Request(u.origin+u.pathname));if(!r)throw fail('播放列表已失效，请重新解析',410);
  if(request.method==='HEAD')await r.body?.cancel();
  return new Response(request.method==='HEAD'?null:r.body,{headers:{...mediaCors,'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store'}});
 }
 if(['GET','HEAD'].includes(request.method)&&u.pathname==='/api/player/resolved-media'){
  const {url,exp}=await verify(u,env);const headers={Referer:BASE};const range=request.headers.get('Range');if(range){if(!/^bytes=\d+-\d*$/.test(range))throw fail('不支持此 Range 请求',400);headers.Range=range;}
  let r=await upstream(url,headers,true);
  if(!r.ok){await r.body?.cancel();throw fail('媒体服务器返回 HTTP '+r.status);}
  const type=r.headers.get('content-type')||'';
  if(/\.m3u8(?:\?|$)/i.test(url)||/mpegurl/i.test(type)){const text=await bounded(r);return new Response(await rewrite(text,url,u.origin,env,exp),{headers:{...mediaCors,'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store'}});}
  r=await mediaRange(r,range);
  const out=new Headers({...mediaCors,'Content-Type':type.toLowerCase().includes('video/mp4')?'video/mp4':'application/octet-stream','Cache-Control':'private, max-age=120','X-Content-Type-Options':'nosniff'});
  for(const h of ['Content-Range','Content-Length','Accept-Ranges'])if(r.headers.has(h))out.set(h,r.headers.get(h));
  if(request.method==='HEAD')await r.body?.cancel();
  return new Response(request.method==='HEAD'?null:r.body,{status:r.status,headers:out});
 }
 return json({error:{code:'METHOD_NOT_ALLOWED',message:'请求方法不受支持'}},405);
 }catch(e){console.error(JSON.stringify({event:'request_error',path:u.pathname,error:e.message}));const status=e.status||502;const code=status===400?'INVALID_REQUEST':/分片已失效|文件长度不足/.test(e.message)?'STALE_MEDIA':status===401?'UNAUTHORIZED':'RESOLVE_FAILED';return json({error:{code,message:e.message||'解析服务暂时不可用'}},status);}
}
