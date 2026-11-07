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
];
const uris = (text: string) => text.split(/\r?\n/).filter(line => line && !line.startsWith('#'));

// Captured 2026-11-07 from bycj.rytvapi.com. First fragment of all four
// insertion groups was decoded and visually confirmed as the same gambling ad.
it.each([
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

it('retains a real Ruyi movie with ordinary uniform scenes and frequent discontinuities', () => {
  const input = fixture('clean-movie.m3u8');
  expect(filterVodAdSegments(input, 'https://cdn7.ryplay7.com/20250501/13887_828cf261/2000k/hls/index.m3u8').playlist).toBe(input);
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
