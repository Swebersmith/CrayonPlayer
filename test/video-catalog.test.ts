/** @jest-environment node */
import { readFileSync } from 'fs';
import { join } from 'path';
import { runInThisContext } from 'vm';
import { iqiyiCatalog, iqiyiEpisodes, qqCatalog, bilibiliCatalog, mangoCatalog, youkuCatalog } from '../src/official-catalog';
import { searchVideoCatalog, videoCatalogDetail, handleVideoCatalog } from '../src/video-catalog';
import { officialPage, parserPage } from '../src/library-sources';
Object.assign(global, runInThisContext('({ReadableStream,TextEncoder,TextDecoder,Response,Headers,Request,AbortController,AbortSignal})'));
const NativeResponse = runInThisContext('Response');
const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures/catalog', name + '.json'), 'utf8'));
const originalFetch = global.fetch;
const reply = (value: unknown) => new NativeResponse(JSON.stringify(value));
afterEach(() => { global.fetch = originalFetch; });

it('finds the real 2025 Mirage series and keeps the same-title film separate, excluding explainers', () => {
  const items = iqiyiCatalog(fixture('iqiyi-search'));
  expect(items).toHaveLength(3);
  expect(items[0]).toMatchObject({ id: 'iqiyi:6244560312265801', title: '海市蜃楼', type: '电视剧', year: '2025', episodeCount: 24 });
  expect(items[0].links).toEqual([{ platform: 'iqiyi', url: 'https://www.iqiyi.com/v_27puk4z5uko.html' }]);
  expect(items[1]).toMatchObject({ title: '海市蜃楼', type: '电影', year: '2018' });
  expect(items[0].id).not.toBe(items[1].id);
});
it('returns all 24 actual official episode URLs and ignores unsafe destinations', () => {
  const data = fixture('iqiyi-episodes');
  data.data.epsodelist.push({ name: 'fake', playUrl: 'https://evil.example/v_fake.html' });
  const episodes = iqiyiEpisodes(data);
  expect(episodes).toHaveLength(24);
  expect(episodes[0].url).toBe('https://www.iqiyi.com/v_27puk4z5uko.html');
  expect(episodes.every(episode => officialPage(episode.url)?.platform === 'iqiyi')).toBe(true);
});
it('uses Tencent programme cards including nested boxes and rejects cross-platform or short-clip results', () => {
  const data = fixture('qq-search'), expected = qqCatalog(data);
  expect(expected.some(item => item.title === '西游记' && item.year === '1986')).toBe(true);
  const nested = { ret: 0, data: { errcode: 0, normalList: { itemList: [{ nestedBoxes: [{ itemList: data.data.normalList.itemList }] }] } } };
  expect(qqCatalog(nested)).toEqual(expected);
  data.data.normalList.itemList[0].videoInfo.episodeSites[0].episodeInfoList = [{ url: 'https://www.iqiyi.com/v_fake.html' }];
  expect(qqCatalog(data).some(item => item.id === expected[0].id)).toBe(false);
});
it('extracts licensed Bilibili seasons and distinguishes provider blocking from zero matches', () => {
  expect(bilibiliCatalog(fixture('bilibili-search'))[0].links[0].url).toContain('/bangumi/play/ss');
  expect(() => mangoCatalog({ code: 200, data: { contents: [], forbidden: 2 } })).toThrow();
  expect(mangoCatalog({ code: 200, data: { contents: [], forbidden: 0 } })).toEqual([]);
  expect(() => youkuCatalog('<script>location="/_____tmd_____/punish?"</script>')).toThrow();
  expect(() => youkuCatalog('<div id="app"></div>')).toThrow();
});
it('searches every selected official platform even after another platform returns results', async () => {
  const urls: string[] = [];
  global.fetch = jest.fn(async (input: string, init: RequestInit) => {
    urls.push(input); expect(new Headers(init.headers).has('Cookie')).toBe(false); expect(new Headers(init.headers).has('Authorization')).toBe(false);
    const url = new URL(input);
    if (url.hostname === 'search.video.iqiyi.com') { expect(url.searchParams.get('if')).toBe('html5'); return reply(fixture('iqiyi-search')); }
    if (url.hostname === 'pbaccess.video.qq.com') return reply(fixture('qq-search'));
    if (url.hostname === 'api.bilibili.com') return reply({ code: 0, data: { result: [] } });
    if (url.hostname === 'mobileso.bz.mgtv.com') return reply({ code: 200, data: { contents: [], forbidden: 2 } });
    return new NativeResponse('_____tmd_____');
  }) as jest.Mock;
  const result = await searchVideoCatalog('海市蜃楼');
  expect(urls).toHaveLength(6);
  expect(result.items.filter(item => item.title === '海市蜃楼')).toHaveLength(2);
  expect(result.providers?.find(provider => provider.platform === 'iqiyi')?.status).toBe('ok');
  expect(result.warning).toContain('芒果'); expect(result.warning).toContain('优酷');
  expect(urls.some(url => /360kan|sogou/.test(url))).toBe(false);
});
it('retains a successful Bilibili category when its other category fails and reports partial results', async () => {
  global.fetch = jest.fn(async (input: string) => new URL(input).searchParams.get('search_type') === 'media_bangumi' ? reply(fixture('bilibili-search')) : new NativeResponse('blocked', { status: 412 })) as jest.Mock;
  const result = await searchVideoCatalog('西游记', 'bilibili');
  expect(result.items).toHaveLength(1);
  expect(result.providers?.[0].status).toBe('partial');
  expect(result.warning).toBeTruthy();
});
it('only queries the chosen platform, reports all failures, and never uses an aggregate fallback', async () => {
  global.fetch = jest.fn(async () => { throw new Error('offline'); }) as jest.Mock;
  const result = await searchVideoCatalog('海市蜃楼', 'iqiyi');
  expect(global.fetch).toHaveBeenCalledTimes(1); expect(result.items).toEqual([]);
  expect(result.providers?.[0].status).toBe('unavailable'); expect(result.warning).toContain('爱奇艺');
});
it('reads official episodes by album ID and rejects arbitrary URLs or cross-platform IDs without fetching', async () => {
  global.fetch = jest.fn(async () => reply(fixture('iqiyi-episodes'))) as jest.Mock;
  const detail = await videoCatalogDetail('iqiyi:6244560312265801', 'iqiyi');
  expect(detail.episodes).toHaveLength(24);
  expect(new URL((global.fetch as jest.Mock).mock.calls[0][0]).hostname).toBe('pcw-api.iqiyi.com');
  (global.fetch as jest.Mock).mockClear();
  for (const id of ['https://evil.example', 'iqiyi:evil', 'iqiyi:123/../../private', 'page:%E0%A4%A']) await expect(videoCatalogDetail(id)).rejects.toThrow('INVALID_REQUEST');
  await expect(videoCatalogDetail('iqiyi:6244560312265801', 'qq')).rejects.toThrow('INVALID_REQUEST');
  expect(global.fetch).not.toHaveBeenCalled();
});
it('rejects removed aggregate sources and requires authentication before calling any official site', async () => {
  global.fetch = jest.fn() as jest.Mock;
  expect((await handleVideoCatalog(new Request('https://player.example/api/player/search?q=test'), () => false))?.status).toBe(401);
  expect((await handleVideoCatalog(new Request('https://player.example/api/player/search?q=test&source=360'), () => true))?.status).toBe(400);
  expect(global.fetch).not.toHaveBeenCalled();
});
it('uses Tencent full episode mode and reads all licensed Bilibili episodes without inventing missing links', async () => {
  global.fetch = jest.fn(async (input: string) => {
    const url = new URL(input);
    if (url.hostname === 'pbaccess.video.qq.com') return reply(fixture(url.searchParams.get('scene') === '8' ? 'qq-episodes' : 'qq-episodes-more'));
    return reply(fixture('bilibili-episodes'));
  }) as jest.Mock;
  const qq = await videoCatalogDetail('qq:aav44xv50k8sfjb', 'qq');
  expect(qq.episodes).toHaveLength(25); expect(qq.total).toBe(25); expect(qq.warning).toBeUndefined();
  expect(qq.episodes[11].title).toBe('12'); expect(qq.episodes[12].title).toBe('13');
  const bili = await videoCatalogDetail('bilibili:46632', 'bilibili');
  expect(bili.episodes).toHaveLength(52); expect(bili.episodes[0].url).toBe('https://www.bilibili.com/bangumi/play/ep787528');
});
it('paginates an official iQIYI album beyond the first 100 episodes', async () => {
  global.fetch = jest.fn(async (input: string) => {
    const page = Number(new URL(input).searchParams.get('page'));
    const start = (page - 1) * 100, length = Math.min(100, 201 - start);
    return reply({ code: 'A00000', data: { total: 201, epsodelist: Array.from({ length }, (_, i) => ({ name: `第${start+i+1}集`, playUrl: `https://www.iqiyi.com/v_episode${start+i+1}.html` })) } });
  }) as jest.Mock;
  const detail = await videoCatalogDetail('iqiyi:123456', 'iqiyi');
  expect(global.fetch).toHaveBeenCalledTimes(3); expect(detail.episodes).toHaveLength(201);
  expect(detail.episodes[200].url).toBe('https://www.iqiyi.com/v_episode201.html');
});
it('rejects home/search pages and domain lookalikes and preserves required video IDs', () => {
  for (const url of ['https://www.iqiyi.com/', 'https://v.qq.com/x/search/?q=foo', 'https://v.qq.com.evil.example/x/cover/a.html', 'javascript:alert(1)']) expect(officialPage(url)).toBeUndefined();
  expect(officialPage('https://v.youku.com/video?vid=XNDQzNDUwNTE4NA==')!.url).toBe('https://v.youku.com/v_show/id_XNDQzNDUwNTE4NA==.html');
  expect(() => parserPage('ql', '西游记')).toThrow();
});
