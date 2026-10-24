/// <reference path="./worker-configuration.d.ts" />
import { handleMediaRelay } from '../../src/media-relay';

async function authorize(request, env) {
  try {
    const auth = request.headers.get('Authorization') || '';
    if (!auth.startsWith('Basic ') || auth.length > 4096) return false;
    const supplied = atob(auth.slice(6));
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw',encoder.encode(env.MEDIA_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
    const expected = await crypto.subtle.sign('HMAC',key,encoder.encode('crayon:'+env.VIEWER_PASSWORD));
    return crypto.subtle.verify('HMAC',key,expected,encoder.encode(supplied));
  } catch { return false; }
}

export default {
  /** @param {Request} request @param {Env} env */
  async fetch(request, env) {
    if (!env.MEDIA_SECRET || !env.VIEWER_PASSWORD) return new Response('请配置 MEDIA_SECRET 和 VIEWER_PASSWORD',{status:503});
    const relay = await handleMediaRelay(request,{
      secret: env.MEDIA_SECRET,
      authorize: request => authorize(request,env),
    });
    // Signed media stays accessible to TVs without the browser's Basic credentials.
    if (relay) {
      if (relay.status === 401 && new URL(request.url).pathname.endsWith('/prepare')) relay.headers.set('WWW-Authenticate','Basic realm="Crayon Player", charset="UTF-8"');
      return relay;
    }
    if (!await authorize(request,env)) return new Response('请登录 Crayon Player',{
      status:401,headers:{'WWW-Authenticate':'Basic realm="Crayon Player", charset="UTF-8"','Cache-Control':'no-store'},
    });
    // Keep the browser URL and query while serving the same independent page.
    const incoming = new URL(request.url);
    if (/^\/parse\/?$/.test(incoming.pathname)) {
      incoming.pathname = '/';
      incoming.search = '';
      const response = await env.ASSETS.fetch(new Request(incoming,request));
      const headers = new Headers(response.headers);
      headers.set('Cache-Control','private, no-store');
      return new Response(response.body,{status:response.status,headers});
    }
    return env.ASSETS.fetch(request);
  },
};
