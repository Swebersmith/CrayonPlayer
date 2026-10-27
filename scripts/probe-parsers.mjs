import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';

// Probe normal browser embedding. Never alter provider scripts or authorization.
const source = process.argv[2] || process.env.PARSER_TEST_SOURCE || 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
const routes = [
  ['tx', 'https://art.txnp.cn/'], ['sd', 'https://bfq.txnp.cn/excessive'],
  ['ql', 'https://svip.qlplayer.cyou/'], ['aibox', 'https://aibox.eu.org/'],
  ['m1907', 'https://im1907.top/'],
].filter(([id]) => !process.argv[3] || process.argv[3].split(',').includes(id));
await mkdir('.parser-inspection', { recursive: true });
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><title>Parser embedding probe</title><body></body>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const bounded = (promise, ms = 5000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Probe observation timed out')), ms))]);
const watchdog = setTimeout(() => process.exit(2), 80000);
try {
  const results = await Promise.all(routes.map(async ([id, prefix]) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [], responses = [], dialogs = [];
    page.on('pageerror', error => errors.push(error.message.slice(0, 200)));
    page.on('requestfailed', request => errors.push(`${new URL(request.url()).hostname}: ${request.failure()?.errorText}`));
    page.on('response', response => { if (response.status() >= 400 || /m3u8|check_auth|api\/|\.ts(?:\?|$)/.test(response.url())) responses.push({ url: response.url().split('?')[0], status: response.status() }); });
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    const url = new URL(prefix); url.searchParams.set(id === 'm1907' ? 'jx' : 'url', source);
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.evaluate(url => {
        const frame = document.createElement('iframe'); frame.src = url;
        frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
        frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
        frame.style = 'width:100%;height:90vh;border:0'; document.body.append(frame);
      }, url.href);
      await page.waitForTimeout(22000);
      if (id === 'm1907') {
        for (const candidate of page.frames().slice(1)) {
          const play = candidate.getByText('播放', { exact: true });
          if (await bounded(play.count(), 3000).catch(() => 0)) { await play.first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(12000); break; }
        }
      }
      const frames = [];
      for (const frame of page.frames().slice(1)) {
        try { frames.push(await bounded(frame.evaluate(() => ({ url: location.href.split('?')[0], title: document.title, text: document.body?.innerText.slice(0, 650), videos: [...document.querySelectorAll('video')].map(v => ({ readyState: v.readyState, duration: Number.isFinite(v.duration) ? v.duration : null, error: v.error?.message, currentTime: v.currentTime })) })))); }
        catch (error) { errors.push(error.message.slice(0, 160)); }
      }
      await page.screenshot({ path: `.parser-inspection/${id}.png`, timeout: 5000 }).catch(error => errors.push(error.message.slice(0, 100)));
      const result = { id, frames, responses, errors: [...new Set(errors)].slice(0, 20), dialogs };
      await writeFile(`.parser-inspection/${id}-result.json`, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result));
      return result;
    } catch (error) { return { id, error: error.message }; }
    finally { await bounded(context.close()).catch(() => {}); }
  }));
  await writeFile('.parser-inspection/browser-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), source, results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await bounded(browser.close()).catch(() => {}); server.close(); clearTimeout(watchdog); }
