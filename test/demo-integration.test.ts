import { integrationExamples } from '../demo-integration';

it('generates current-domain App links and an escaped iframe without losing signed URL parameters', () => {
  const source = 'https://media.example/movie.m3u8?token=a+b/c==&part=2#track';
  const examples = integrationExamples('https://player.example/?embed=0', source, true);
  expect(examples.prefix).toBe('https://player.example/parse?url=');
  expect(new URL(examples.prefix + encodeURIComponent(source)).searchParams.get('url')).toBe(source);
  expect(new URL(examples.link).searchParams.get('url')).toBe(source);
  document.body.innerHTML = examples.iframe;
  const iframe = document.querySelector('iframe')!;
  expect(new URL(iframe.src).searchParams.get('url')).toBe(source);
  expect(new URL(iframe.src).searchParams.get('embed')).toBe('1');
  expect(iframe.allowFullscreen).toBe(true);
  document.body.innerHTML = '';
});

it('preserves the deployment subdirectory and explicitly embeds static pages', () => {
  const examples = integrationExamples('https://player.example/player/index.html?url=old', 'https://media.example/movie.mp4', false);
  expect(examples.prefix).toBe('https://player.example/player/?url=');
  expect(new URL(examples.link).pathname).toBe('/player/');
  expect(examples.iframe).toContain('&amp;embed=1');
  expect(() => integrationExamples('https://player.example/', 'javascript:alert(1)', true)).toThrow();
});

it('carries the selected parser through App prefixes and embedded links',()=>{
  const source='https://v.qq.com/x/cover/show.html?token=a+b&part=2';
  const examples=integrationExamples('https://player.example/',source,true,'ql');
  const parsed=new URL(examples.prefix+encodeURIComponent(source));
  expect(parsed.searchParams.get('parser')).toBe('ql');
  expect(parsed.searchParams.get('url')).toBe(source);
  expect(new URL(examples.link).searchParams.get('parser')).toBe('ql');
  expect(examples.iframe).toContain('parser=ql');
});
