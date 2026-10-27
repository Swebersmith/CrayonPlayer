import { initialParser, parserPage } from '../demo-parsers';

it('keeps signed source URLs intact when constructing all five parser links',()=>{
  const source='https://v.qq.com/x/cover/a.html?token=a+b/c==&part=2#video';
  for(const id of ['tx','sd','ql','aibox']) expect(new URL(parserPage(id,source)).searchParams.get('url')).toBe(source);
  expect(new URL(parserPage('m1907',source)).searchParams.get('jx')).toBe(source);
  expect(new URL(parserPage('m1907','西游记')).searchParams.get('jx')).toBe('西游记');
});

it('defaults concrete platform pages to QL while preserving native and explicit choices',()=>{
  expect(initialParser('https://player.example/','https://v.qq.com/x/cover/a.html')).toBe('ql');
  expect(initialParser('https://player.example/','https://media.example/extensionless?id=1')).toBe('native');
  expect(initialParser('https://player.example/?parser=native','https://v.qq.com/x/cover/a.html')).toBe('native');
  expect(initialParser('https://player.example/','https://v.qq.com/movie.mp4')).toBe('native');
  expect(()=>initialParser('https://player.example/?parser=unknown','https://media.example/a.mp4')).toThrow('未知播放线路');
});
