/** @jest-environment node */
import { readFileSync } from 'fs';
import { join } from 'path';
import { runInThisContext } from 'vm';
import { searchVideoCatalog, videoCatalogDetail, handleVideoCatalog } from '../src/video-catalog';
Object.assign(global, runInThisContext('({ReadableStream,TextEncoder,TextDecoder,Response,Headers,Request,AbortController,AbortSignal})'));
const NativeResponse = runInThisContext('Response');
const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures/catalog/videosearch-' + name + '.json'), 'utf8'));
const originalFetch = global.fetch;
const reply = (value: unknown, status = 200) => new NativeResponse(JSON.stringify(value), { status });
afterEach(() => { global.fetch = originalFetch; });

it('uses only VideoSearch and follows the exact detail_url retaining all 24 episodes', async () => {
  global.fetch = jest.fn(async (input: string, init: RequestInit) => {
    const url = new URL(input);
    expect(url.hostname).toBe('videosearch.webber.qzz.io');
    expect(new Headers(init.headers).has('Cookie')).toBe(false);
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    expect(init.redirect).toBe('manual');
    return reply(fixture(url.pathname.endsWith('/search') ? 'search' : 'detail'));
  }) as jest.Mock;
  const result = await searchVideoCatalog('海市蜃楼');
  expect(result.items[0]).toMatchObject({ title: '海市蜃楼', year: '2025', type: '电视剧', episodeCount: 24 });
  expect(result.warning).toContain('芒果');
  expect(result.providers?.find(row => row.platform === 'qq')?.status).toBe('unavailable');
  const detail = await videoCatalogDetail(result.items[0].id, 'iqiyi');
  expect(detail.episodes).toHaveLength(24);
  expect(detail.episodes[0].title).toBe('海市蜃楼第1集');
  expect(detail.warning).toBeUndefined();
  expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('https://videosearch.webber.qzz.io' + fixture('search').results[0].detail_url);
});

it.each([['qq', 'tencent'], ['mgtv', 'mango'], ['iqiyi', 'iqiyi'], ['youku', 'youku'], ['bilibili', 'bilibili']])('maps %s to the API platform %s', async (local, remote) => {
  global.fetch = jest.fn(async () => reply({ ok: true, results: [], providers: [{ platform: remote, status: 'empty' }] })) as jest.Mock;
  const result = await searchVideoCatalog('片名', local);
  const url = new URL((global.fetch as jest.Mock).mock.calls[0][0]);
  expect(url.searchParams.get('platforms')).toBe(remote);
  expect(url.searchParams.get('view')).toBe('series');
  expect(result.providers?.[0].status).toBe('ok');
});

it('keeps same-title versions, long titles and results without a preview URL', async () => {
  const data = fixture('search');
  const title = '这是完整剧名'.repeat(80);
  data.results = [{ ...data.results[0], title, url: '' }, { ...data.results[0], year: '2018', detail_url: '/v1/iqiyi/series/2045522800?q=电影' }];
  global.fetch = jest.fn(async () => reply(data)) as jest.Mock;
  const result = await searchVideoCatalog('海市蜃楼');
  expect(result.items).toHaveLength(2);
  expect(result.items[0].title).toBe(title);
  expect(result.items[0].links).toEqual([]);
  expect(result.items[0].id).not.toBe(result.items[1].id);
});

it('preserves extra episode names and reports missing episodes while filtering unsafe URLs', async () => {
  const data = fixture('detail');
  const title = '第1期 上下篇 加更：' + '完整名称'.repeat(80);
  data.episodes.push({ platform: 'iqiyi', title, url: 'https://www.iqiyi.com/v_extra.html', episode_type: 'extra' });
  data.episodes.push({ platform: 'iqiyi', title: 'unsafe', url: 'https://evil.example/video' });
  Object.assign(data, { complete: false, partial: true, missing_episode_numbers: [25], warnings: ['UPSTREAM_PARTIAL'] });
  global.fetch = jest.fn(async () => reply(data)) as jest.Mock;
  const detail = await videoCatalogDetail('videosearch:' + encodeURIComponent(data.series.detail_url));
  expect(detail.episodes).toHaveLength(25);
  expect(detail.episodes[24].title).toBe(title);
  expect(detail.warning).toContain('缺少集数：25');
  expect(detail.warning).toContain('尚未取齐');
});

it('rejects arbitrary detail URLs and cross-platform IDs before fetching', async () => {
  global.fetch = jest.fn() as jest.Mock;
  for (const path of ['https://evil.example/v1/iqiyi/series/123', '//evil.example/v1/iqiyi/series/123', '/v1/iqiyi/series/123/../../health', '/health', '/v1/iqiyi/series/123?url=https://evil.example']) {
    await expect(videoCatalogDetail('videosearch:' + encodeURIComponent(path))).rejects.toThrow('INVALID_REQUEST');
  }
  await expect(videoCatalogDetail('videosearch:' + encodeURIComponent('/v1/iqiyi/series/123'), 'qq')).rejects.toThrow('INVALID_REQUEST');
  await expect(videoCatalogDetail('iqiyi:123')).rejects.toThrow('INVALID_REQUEST');
  expect(global.fetch).not.toHaveBeenCalled();
});

it.each([503, 401, 302])('surfaces upstream HTTP %s as unavailable', async status => {
  global.fetch = jest.fn(async () => reply({}, status)) as jest.Mock;
  const result = await handleVideoCatalog(new Request('https://player.example/api/player/search?q=test'), () => true);
  expect(result?.status).toBe(502);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it('requires local authorization and validates inputs before requesting VideoSearch', async () => {
  global.fetch = jest.fn() as jest.Mock;
  expect((await handleVideoCatalog(new Request('https://player.example/api/player/search?q=test'), () => false))?.status).toBe(401);
  for (const query of ['q=', 'q=test&platform=evil', 'q=test&source=360']) {
    expect((await handleVideoCatalog(new Request('https://player.example/api/player/search?' + query), () => true))?.status).toBe(400);
  }
  expect(global.fetch).not.toHaveBeenCalled();
});
