/// <reference path="./worker-configuration.d.ts" />
import { handleMediaRelay } from '../../src/media-relay';
import { authorizeViewer, embeddedSession, handleViewerAuth, viewerLoginPage } from './viewer-auth.mjs';

export default {
  /** @param {Request} request @param {Env} env */
  async fetch(request, env) {
    if (!env.MEDIA_SECRET || !env.VIEWER_PASSWORD) return new Response('请配置 MEDIA_SECRET 和 VIEWER_PASSWORD',{status:503});
    const auth = await handleViewerAuth(request, env);
    if (auth) return auth;
    const relay = await handleMediaRelay(request,{
      secret: env.MEDIA_SECRET,
      authorize: async request => await authorizeViewer(request,env) || !!await embeddedSession(request,env),
    });
    // Signed media stays accessible to TVs without the browser's session cookie.
    if (relay) {
      if (relay.status === 401 && new URL(request.url).pathname.endsWith('/prepare')) {
        const headers = new Headers(relay.headers);
        headers.set('Content-Type', 'application/json; charset=UTF-8');
        return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), { status: 401, headers });
      }
      return relay;
    }
    const pageUrl = new URL(request.url);
    const navigation = pageUrl.pathname === '/' || /^\/parse\/?$/.test(pageUrl.pathname);
    const embedded = navigation && (pageUrl.searchParams.get('embed') === '1' ||
      /^\/parse\/?$/.test(pageUrl.pathname) && pageUrl.searchParams.get('embed') !== '0' ||
      request.headers.get('Sec-Fetch-Dest') === 'iframe');
    // Only the embed UI and its compiled JS/CSS are public. All preparation still
    // requires a verified session; no video is loaded before the UI authenticates.
    const publicUi = ['GET', 'HEAD'].includes(request.method) &&
      (embedded || /^\/assets\/[\w-]+\.(?:js|css)$/.test(pageUrl.pathname));
    if (!publicUi && !await authorizeViewer(request,env)) {
      const url = new URL(request.url);
      const navigation = url.pathname === '/' || /^\/parse\/?$/.test(url.pathname) || request.headers.get('Accept')?.includes('text/html');
      if (navigation && ['GET', 'HEAD'].includes(request.method)) return viewerLoginPage(request);
      return new Response('请先输入访问密码', { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
    }
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
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    return new Response(response.body, { status: response.status, headers });
  },
};
