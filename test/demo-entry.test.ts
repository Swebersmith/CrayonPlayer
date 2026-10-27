import { demoSource, mediaAddress, playbackEntry, playbackLink } from '../demo-entry';

it('round-trips signed media URLs without losing their own query and fragment',()=>{
  const source='https://media.example/episode.m3u8?token=a+b/c==&episode=2#track';
  const link=playbackLink('https://player.example/',source,true);
  expect(new URL(link).pathname).toBe('/parse');
  expect(new URL(link).searchParams.get('url')).toBe(source);
  expect(playbackEntry(link)).toEqual({embedded:true,url:source,error:''});
  expect(playbackEntry(link+'&embed=0').embedded).toBe(false);
});

it('keeps static installations in their subdirectory and leaves the homepage demo usable',()=>{
  const source='https://media.example/movie.mp4';
  const link=playbackLink('https://player.example/player/index.html',source,false);
  expect(new URL(link).pathname).toBe('/player/');
  expect(playbackEntry(link).url).toBe(source);
  expect(playbackEntry('https://player.example/')).toEqual({embedded:false,url:demoSource,error:''});
});

it.each(['javascript:alert(1)','file:///movie.mp4','https://name:password@media.example/a.m3u8','not a URL',''])('rejects unsafe or missing media without playing the demo: %s',source=>{
  const link='https://player.example/parse?'+new URLSearchParams({url:source});
  const entry=playbackEntry(link);
  expect(entry.url).toBe('');
  expect(entry.error).toBeTruthy();
  expect(()=>mediaAddress(source)).toThrow();
});

it('shows a missing-address error for the parse entry',()=>{
  expect(playbackEntry('https://player.example/parse/')).toMatchObject({url:'',embedded:true,error:expect.stringContaining('缺少视频地址')});
});

it('round-trips film names only with the M1907 route',()=>{
  const link=playbackLink('https://player.example/','西游记',true,'m1907');
  expect(playbackEntry(link)).toMatchObject({url:'西游记',error:''});
  expect(()=>playbackLink('https://player.example/','西游记',true,'ql')).toThrow();
});
