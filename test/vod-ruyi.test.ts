import { readFileSync } from 'fs';
import { join } from 'path';
import Hls from 'hls.js';
import type { Loader, LoaderContext } from 'hls.js';

import { vodAdLoader } from '../src/vod-ad-filter';
import { filterVodAdSegments, sourceToFilteredTime, filteredToSourceTime } from '../src/vod-segment-filter';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__/ruyi', name), 'utf8');
const urls = [
  'https://cdn.ryplay12.com/20261001/42140_c77b26e4/2000k/hls/index.m3u8',
  'https://cdn.ryplay12.com/20251006/22917_c962e8c4/2000k/hls/index.m3u8',
  'https://svip.ryiplay18.com/20260531/6798_92c24498/2000k/hls/index.m3u8',
  'https://svip.ryiplay18.com/20261117/16421_67b92b35/2000k/hls/index.m3u8',
];
const uris = (text: string) => text.split(/\r?\n/).filter(line => line && !line.startsWith('#'));

it('retains Ruyi identity through signed manifests and segment URLs', () => {
  const original = fixture('bear-season2.m3u8');
  const relay = (uri: string) => 'https://player.demo.site/api/jiexi/resolved-media?' + new URLSearchParams({ url: new URL(uri, urls[0]).href, exp: '9999999999', sig: 'signed-capability' });
  const signed = original.split(/\r?\n/).map(line => line && !line.startsWith('#') ? relay(line) : line).join('\n');
  const result = filterVodAdSegments(signed, relay(urls[0]));
  expect(result.removed).toEqual(filterVodAdSegments(original, urls[0]).removed);
  expect(result.removed).toHaveLength(1);
  expect(uris(result.playlist).every(line => signed.includes(line))).toBe(true);
});

// Captured 2026-11-07 from bycj.rytvapi.com. First fragment of all four
// insertion groups was decoded and visually confirmed as the same gambling ad.
// The current sample was captured on 2026-11-17; its 20s package was visually
// confirmed at 663.04s while the surrounding uniform groups are normal video.
it.each([
  ['bear-season2-current.m3u8', 0, [[663.04, 682.92]]],
  ['zouma-ren-ep35.m3u8', 3, [[661.0, 680.88]]],
  ['bear-season2.m3u8', 0, [[529.28, 550.28]]],
  ['bear-season1.m3u8', 1, [[480.36, 499.36]]],
  ['movie.m3u8', 2, [[582.4, 601.4], [3380.36, 3401.36]]],
] as const)('removes only verified Ruyi insertion groups in %s', (file, index, ranges) => {
  const input = fixture(file);
  const result = filterVodAdSegments(input, urls[index]);
  expect(result.reason).toBe('filtered');
  expect(result.removed).toHaveLength(ranges.length);
  result.removed.forEach((range, i) => {
    expect(range.start).toBeCloseTo(ranges[i][0]);
    expect(range.end).toBeCloseTo(ranges[i][1]);
    const filtered = sourceToFilteredTime(result.removed, range.start);
    expect(filteredToSourceTime(result.removed, filtered)).toBeCloseTo(range.end);
  });
  let time = 0;
  const retained: string[] = [];
  const matches = Array.from(input.matchAll(/#EXTINF:([\d.]+),\r?\n([^\r\n]+)/g));
  for (const match of matches) {
    if (!ranges.some(([start, end]) => time >= start - 0.001 && time < end - 0.001)) retained.push(match[2]);
    time += Number(match[1]);
  }
  expect(uris(result.playlist)).toEqual(retained);
  expect(filterVodAdSegments(result.playlist, urls[index]).playlist).toBe(result.playlist);
});

it('removes the current 20s package through signed manifests and segment URLs', () => {
  const original = fixture('bear-season2-current.m3u8');
  const relay = (uri: string) => 'https://player.demo.site/api/jiexi/resolved-media?' + new URLSearchParams({ url: new URL(uri, urls[0]).href, exp: '9999999999', sig: 'signed-capability' });
  const signed = original.split(/\r?\n/).map(line => line && !line.startsWith('#') ? relay(line) : line).join('\n');
  const result = filterVodAdSegments(signed, relay(urls[0]));
  expect(result.removed).toHaveLength(1);
  expect(result.removed[0].start).toBeCloseTo(663.04);
  expect(result.removed[0].end).toBeCloseTo(682.92);
  expect(uris(result.playlist).every(line => signed.includes(line))).toBe(true);
});

it('recognizes a 20s package spliced into a six-segment Ruyi timeline', () => {
  const url = 'https://cdn.ryplay12.com/20261001/42140_c77b26e4/2000k/hls/index.m3u8';
  const group = (offset: number, values: number[]) => '#EXT-X-DISCONTINUITY\n' + values.map((value, index) =>
    `#EXTINF:${value.toFixed(3)},\n${(offset * 6 + index).toString(16).padStart(32, '0')}.ts`).join('\n') + '\n';
  const program = [3, 5, 4.5, 2.5, 6, 3];
  let content = '#EXTM3U\n#EXT-X-VERSION:3\n';
  for (let index = 0; index < 6; index++) content += group(index, program);
  content += group(6, [4, 4, 4, 4, 3.88]);
  for (let index = 7; index < 10; index++) content += group(index, program);
  content += '#EXT-X-ENDLIST\n';
  const result = filterVodAdSegments(content, url);
  expect(result.removed).toHaveLength(1);
  expect(result.removed[0].start).toBeCloseTo(144);
  expect(result.removed[0].end).toBeCloseTo(163.88);
});

it('removes the repeated 20s package from a Ruyi movie and retains its ordinary groups', () => {
  const input = fixture('clean-movie.m3u8');
  const result = filterVodAdSegments(input, 'https://cdn7.ryplay7.com/20250501/13887_828cf261/2000k/hls/index.m3u8');
  expect(result.reason).toBe('filtered');
  expect(result.removed).toHaveLength(2);
  expect(result.removed[0].start).toBeCloseTo(640.56);
  expect(result.removed[0].end).toBeCloseTo(660.44);
  expect(result.removed[1].start).toBeCloseTo(2861.16);
  expect(result.removed[1].end).toBeCloseTo(2881.04);
  expect(uris(result.playlist)).toHaveLength(uris(input).length - 10);
});

it.each([
  'https://unrelated.example/20251006/22917_c962e8c4/2000k/hls/index.m3u8',
  'https://cdn.ryplay12.com.evil.example/20251006/22917_c962e8c4/2000k/hls/index.m3u8',
  'https://cdn.ryplay12.com/ordinary/index.m3u8',
])('does not apply the provider profile to %s', url => {
  const input = fixture('bear-season1.m3u8');
  expect(filterVodAdSegments(input, url).playlist).toBe(input);
});

it('retains incomplete, mixed-path and different-cadence groups, including normal content at eight minutes', () => {
  const input = fixture('bear-season1.m3u8');
  const head = '4dd23112327786bce3c397cf4ee4ec9e.ts';
  for (const changed of [
    input.replace(head, 'programme.ts'),
    input.replace(head, `https://another.example/${head}`),
    input.replace('#EXTINF:3.000000,\nf90d', '#EXTINF:2.000000,\nf90d'),
    input.replace(`#EXT-X-DISCONTINUITY\n#EXTINF:4.000000,\n${head}`, `#EXTINF:4.000000,\n${head}`),
  ]) expect(filterVodAdSegments(changed, urls[1]).playlist).toBe(changed);
});

it('accepts signed absolute Ruyi segments without changing retained signatures', () => {
  const url = urls[1];
  const input = fixture('bear-season1.m3u8').replace(/^([a-f\d]{32}\.ts)$/gm,
    (_all, uri) => new URL(uri, url).href + '?token=a%2Fb&x=1');
  const result = filterVodAdSegments(input, url + '?token=playlist');
  expect(result.removed).toHaveLength(1);
  expect(uris(result.playlist).every(uri => uri.endsWith('?token=a%2Fb&x=1'))).toBe(true);
});

it('filters through the real hls.js loader and parser with the corrected duration', () => {
  const input = fixture('bear-season1.m3u8');
  const report = jest.fn();
  const prototype = Hls.DefaultConfig.loader.prototype as Loader<LoaderContext>;
  const load = jest.spyOn(prototype, 'load').mockImplementation(function (this: Loader<LoaderContext>, context, _config, callbacks) {
    callbacks.onSuccess({url: context.url, data: input}, this.stats, context, null);
  });
  const hls = new Hls({loader: vodAdLoader(Hls.DefaultConfig.loader, report)});
  let duration = 0;
  hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => { duration = data.details.totalduration; });
  try {
    hls.loadSource(urls[1]);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({reason: 'filtered'}));
    expect(duration).toBeCloseTo(704.08 - 19);
  } finally { hls.destroy(); load.mockRestore(); }
});
