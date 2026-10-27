import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
const run = promisify(execFile);
await mkdir('.parser-inspection/search', { recursive: true });
const keyword = encodeURIComponent(process.argv[2] || '西游记');
const endpoints = [
  ['360', `https://api.so.360kan.com/index?kw=${keyword}&from=so_result&num=20`],
  ['360web', `https://so.360kan.com/index.php?kw=${keyword}`],
  ['iqiyi', `https://search.video.iqiyi.com/o?if=pcw&key=${keyword}&pageNum=1&pageSize=10`],
  ['iqiyiweb', `https://so.iqiyi.com/so/q_${keyword}`],
  ['mgtv', `https://mobileso.bz.mgtv.com/msite/search/v2?q=${keyword}&pc=1&pn=1`],
  ['qq', `https://v.qq.com/x/search/?q=${keyword}`],
  ['youku', `https://so.youku.com/search_video/q_${keyword}`],
  ['bilibili', `https://api.bilibili.com/x/web-interface/search/type?search_type=media_bangumi&keyword=${keyword}`],
  ['sogou', `https://v.sogou.com/v?query=${keyword}`],
  ['episodes', 'https://api.so.360kan.com/episodesv2?cat=2&id=QblsaKepSGDqMH&site=qiyi&start=1&end=25'],
  ['detail', 'https://api.web.360kan.com/v1/detail?cat=2&id=QblsaKepSGDqMH'],
  ['mango-pc', `https://mobileso.bz.mgtv.com/pc/search/v2?q=${keyword}&pn=1&pc=1`],
];
await Promise.all(endpoints.filter(([id])=>!process.argv[3]||process.argv[3].split(',').includes(id)).map(async ([id,url]) => {
  try {
    const { stdout } = await run('curl.exe', ['-sS', '-L', '--max-time', '25', '-A', 'Mozilla/5.0', url], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
    await writeFile(`.parser-inspection/search/${id}.txt`, stdout);
    let summary;
    try { const json = JSON.parse(stdout); summary = { code: json.code, keys: Object.keys(json), dataKeys: Object.keys(json.data || {}).slice(0,12) }; }
    catch { summary = { title: /<title[^>]*>(.*?)<\/title>/s.exec(stdout)?.[1], officialLinks: (stdout.match(/https?:[^\s"<>\\]+(?:iqiyi\.com|v\.qq\.com|youku\.com|mgtv\.com|bilibili\.com)[^\s"<>\\]*/g)||[]).slice(0,3) }; }
    console.log(JSON.stringify({id,bytes:stdout.length,...summary}));
  } catch(error) { console.log(JSON.stringify({ id, error: error.message.slice(0,100) })); }
}));
