/// <reference path="./worker-configuration.d.ts" />
import { handleMediaRelay } from '../../src/media-relay';

export default {
  /** @param {Request} request @param {Env} env */
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (incoming.pathname.startsWith('/auth/') ||
      ['/api/player/search', '/api/player/detail', '/api/player/resolve'].includes(incoming.pathname)) {
      return new Response('Not found', { status: 404 });
    }
    if (incoming.pathname.startsWith('/api/player/')) {
      if (!env.MEDIA_SECRET) return new Response('请配置 MEDIA_SECRET', { status: 503 });
      const relay = await handleMediaRelay(request, {
        secret: env.MEDIA_SECRET,
        authorize: () => true,
      });
      if (relay) return relay;
      return new Response('Not found', { status: 404 });
    }
    // Keep existing direct playback links working with the standalone page.
    if (/^\/parse\/?$/.test(incoming.pathname)) {
      incoming.pathname = '/';
      incoming.search = '';
    }
    const response = await env.ASSETS.fetch(new Request(incoming, request));
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    return new Response(response.body, { status: response.status, headers });
  },
};
