import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const sources = process.argv.length > 2 ? process.argv.slice(2) : [
  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  'https://v.qq.com/x/cover/m441e3rjq9kwpsc.html',
  'https://www.iqiyi.com/v_1jdppwo3vk8.html',
];
const get = url => execFileSync('curl.exe', ['-sS', '-L', '--max-time', '30', url], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
for (const [index, source] of sources.entries()) {
  const page = new URL('https://svip.qlplayer.cyou/'); page.searchParams.set('url', source);
  const html = get(page.href);
  const token = /apiToken:\s*("(?:[^"\\]|\\.)*")/.exec(html);
  if (!token) { console.log({ source, error: 'No page token' }); continue; }
  const api = new URL('https://svip.qlplayer.cyou/api/resolve.php'); api.searchParams.set('token', JSON.parse(token[1]));
  const data = JSON.parse(get(api.href));
  writeFileSync(`.parser-inspection/ql-api-${source.includes('v.qq') ? 'qq' : source.includes('iqiyi') ? 'iqiyi' : 'mux'}-${index}.json`, JSON.stringify(data, null, 2));
  console.log(JSON.stringify({ source, code: data.code, message: data.msg, mediaHost: data.url ? new URL(data.url).hostname : '', type: data.type }));
}
