import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve('miniflare', { paths: [require.resolve('wrangler/package.json')] }));
const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('wrangler/package.json')] }));
const code = esbuild.buildSync({ entryPoints: ['examples/cloudflare/worker.mjs'], bundle: true, write: false, format: 'esm', platform: 'browser' }).outputFiles[0].text;
const assetRoot = resolve('demo-dist');
await mkdir('.parser-inspection', { recursive: true });
const runtime = new Miniflare(convertV4MiniflareOptions({ cf: false, workers: [{
  name: 'parser-playback-check', compatibilityDate: '2026-10-23', modules: true, script: code,
  bindings: { MEDIA_SECRET: 'local-test-only-media-secret-123456789', VIEWER_PASSWORD: 'local-test-only-password' },
  serviceBindings: { ASSETS: async request => {
    const path = resolve(assetRoot, '.' + new URL(request.url).pathname.replace(/\/$/, '/index.html'));
    if (!path.startsWith(assetRoot + sep)) return new Response('not found', { status: 404 });
    try { return new Response(await readFile(path), { headers: { 'Content-Type': path.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' } }); }
    catch { return new Response('not found', { status: 404 }); }
  } },
}] }));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const watchdog = setTimeout(() => process.exit(2), 110000);
let page;
const errors = [], responses = [];
try {
  const searchMode = process.argv.includes('--search');
  const origin = String(await runtime.ready);
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // Exercise the resolver independently of the optional media relay network.
  if (!process.argv.includes('--relay')) await page.addInitScript(() => localStorage.setItem('crayon-player-server-relay', '0'));
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`));
  page.on('response', async response => { if (response.url().includes('/api/') || response.status() >= 400) responses.push({ path: new URL(response.url()).pathname, status: response.status(), ...(response.url().includes('/api/player/resolve') && response.status() >= 400 ? { body: await response.text() } : {}) }); if (response.url().includes('/api/player/search')) await writeFile('.parser-inspection/live-search.json', await response.text()).catch(() => {}); if (response.url().includes('/api/player/detail')) await writeFile('.parser-inspection/live-detail.json', await response.text()).catch(() => {}); });
  const url = new URL(origin);
  url.searchParams.set('url', searchMode ? 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' : process.argv.slice(2).find(value=>!value.startsWith('--')) || 'https://www.iqiyi.com/v_19rrjaail0.html');
  url.searchParams.set('parser', searchMode ? 'native' : 'ql');
  await page.goto(url.href);
  await page.locator('input[name="password"]').fill('local-test-only-password');
  await page.locator('button[type="submit"]').click();
  const revealMenu = () => page.locator('.crayon-library-wake').focus();
  if (searchMode) {
    await revealMenu();
    await page.locator('[data-action="search"]').click();
    await page.locator('.crayon-library-form input').fill('西游记');
    await page.locator('.crayon-library-form button[type="submit"]').click();
    await page.locator('.crayon-library-result').first().waitFor({ timeout: 35000 });
    await page.screenshot({ path: '.parser-inspection/search-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.parser-inspection/search-mobile.png' });
    await page.locator('.crayon-library-result').filter({hasText:'爱奇艺'}).first().click();
    await page.locator('.crayon-library-platforms button').filter({hasText:'爱奇艺'}).click();
    await page.locator('.crayon-library-episodes button').first().waitFor({ timeout: 25000 });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: '.parser-inspection/search-episodes.png' });
    await page.locator('.crayon-library-episodes button').last().click();
  }
  await page.locator('#player video').waitFor({ state: 'attached', timeout: 45000 });
  await page.locator('video').evaluate(video => { video.muted = true; void video.play(); });
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2, null, { timeout: 35000 });
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 1, null, { timeout: 15000 });
  await revealMenu(); await page.locator('[data-action="routes"]').click();
  await page.screenshot({ path: '.parser-inspection/ql-native-playback.png' });
  const result = await page.locator('video').evaluate(video => ({ currentTime: video.currentTime, readyState: video.readyState, duration: video.duration, paused: video.paused }));
  result.errors = errors;
  await writeFile('.parser-inspection/playback-result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (searchMode) {
    await page.locator('[data-action="close"]').click();
    await page.locator('[data-action="fullscreen"]').click();
    await page.locator('[data-action="search"]').click();
    const insideFullscreen = await page.evaluate(() => !!document.fullscreenElement?.querySelector('[data-crayon-library]'));
    if (!insideFullscreen) throw new Error('Search is outside the fullscreen root');
    await page.screenshot({ path: '.parser-inspection/search-fullscreen.png' });
    console.log(JSON.stringify({ insideFullscreen, searchToPlayback: true }));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.parser-inspection/mobile.png' });
} catch (error) {
  if (page) {
    await page.screenshot({ path: '.parser-inspection/playback-failure.png', timeout: 5000 }).catch(() => {});
    console.log(JSON.stringify({ errors, responses, text: await page.locator('body').innerText({ timeout: 2000 }).catch(() => '') }));
  }
  throw error;
} finally { clearTimeout(watchdog); await browser.close(); await runtime.dispose(); }
