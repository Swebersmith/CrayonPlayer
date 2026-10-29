import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { searchVideoCatalog, videoCatalogDetail } from '../dist/server.mjs';
const search = JSON.parse(await readFile('test/fixtures/catalog/videosearch-search.json','utf8'));
const detail = JSON.parse(await readFile('test/fixtures/catalog/videosearch-detail.json','utf8'));
const title = '海市蜃楼：谜团背后的完整故事与特别篇（2025 年完整剧集版本）';
search.results[0].title = title;
detail.series.title = title;
detail.episodes[0].title = '海市蜃楼第1集：神秘来客打破平静，真相与幻象之间的第一次交锋（完整分集标题）';
const nativeFetch = globalThis.fetch;
globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('/search?') ? search : detail));
const items = await searchVideoCatalog('海市蜃楼');
const episodes = await videoCatalogDetail(items.items[0].id, 'iqiyi');
globalThis.fetch = nativeFetch;
const bundle = await readFile('dist/crayon-player.iife.js');
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#101714;display:grid;place-items:center;min-height:100vh}#player{width:min(960px,100vw);height:min(540px,56.25vw)}</style><div id="player"></div><script src="/player.js"></script><script>window.p=CrayonPlayer.createCrayonPlayer({container:'#player',url:'',enhancements:{casting:{chromecast:false}},library:{resolveEndpoint:false}});p.loading.show=false;</script>`;
const server = createServer((request,response) => {
  response.setHeader('Content-Type', request.url.startsWith('/api') ? 'application/json' : request.url === '/player.js' ? 'text/javascript' : 'text/html; charset=utf-8');
  response.end(request.url.startsWith('/api/player/search') ? JSON.stringify(items) : request.url.startsWith('/api/player/detail') ? JSON.stringify(episodes) : request.url === '/player.js' ? bundle : html);
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
await mkdir('.parser-inspection/search', { recursive:true });
const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true });
try {
  for (const mode of ['desktop','compact','mobile']) {
    const mobile = mode === 'mobile';
    const context = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
    const page = await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    if(mode==='compact') await page.locator('#player').evaluate(el=>el.style.height='300px');
    await page.evaluate(()=>p.library.open());
    await page.locator('.crayon-library-form input').fill('海市蜃楼');
    await page.locator('.crayon-library-form').evaluate(el=>el.requestSubmit());
    await page.locator('button.crayon-library-result').waitFor();
    assert.equal(await page.locator('button.crayon-library-result strong').textContent(),title);
    await page.waitForTimeout(400);
    await page.screenshot({path:`.parser-inspection/search/${mode}-results.png`});
    await page.locator('button.crayon-library-result').click();
    await page.locator('.crayon-library-episodes button').first().waitFor();
    assert.equal(await page.locator('.crayon-library-episodes button').count(),24);
    assert.equal(await page.locator('.crayon-library-episodes button').first().textContent(),detail.episodes[0].title);
    const geometry=await page.locator('.crayon-library-episodes button').evaluateAll(els=>els.map(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight,width:el.clientWidth,scrollWidth:el.scrollWidth,whiteSpace:getComputedStyle(el).whiteSpace})));
    assert(geometry.every(el=>el.scrollHeight<=el.height+1 && el.scrollWidth<=el.width+1 && el.whiteSpace==='normal'),JSON.stringify(geometry));
    const heading=await page.locator('.crayon-library-collection-title').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,whiteSpace:getComputedStyle(el).whiteSpace}));
    assert(heading.scrollWidth<=heading.width+1 && heading.whiteSpace==='normal',JSON.stringify(heading));
    await page.waitForTimeout(400);
    await page.screenshot({path:`.parser-inspection/search/${mode}-episodes.png`});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({mode,episodes:24,fullTitles:true,noTextClipping:true}));
    await context.close();
  }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
