import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const bundle = await readFile('dist/crayon-player.iife.js');
const html = `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#101714;display:grid;place-items:center;min-height:100vh}#player{width:min(960px,100vw);height:min(540px,56.25vw)}</style><div id="player"></div><script src="/player.js"></script><script>
const p=CrayonPlayer.createCrayonPlayer({container:'#player',url:'',enhancements:{casting:false},library:{searchEndpoint:false,detailEndpoint:false,resolveEndpoint:false}});
window.testPlayer=p;p.loading.show=false;
const c=document.createElement('canvas');c.width=960;c.height=540;const ctx=c.getContext('2d');
setInterval(()=>{ctx.fillStyle='#203c36';ctx.fillRect(0,0,960,540);ctx.fillStyle='#b2e0bc';ctx.font='24px sans-serif';ctx.fillText('CRAYON PLAYER',42,68)},100);
p.video.srcObject=c.captureStream(5);p.video.muted=true;void p.video.play();
</script></html>`;
const server = createServer((request,response)=>{
  response.setHeader('Content-Type',request.url==='/player.js'?'text/javascript':'text/html; charset=utf-8');
  response.end(request.url==='/player.js'?bundle:html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
await mkdir('.parser-inspection', {recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  for(const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile});
    const page=await context.newPage();
    await page.route('https://art.txnp.cn/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><button id="upstream" onclick="this.textContent=\'Clicked\'">Upstream player</button>'}));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const root=page.locator('[data-player="crayon-player"]'), bar=page.locator('.crayon-library-bar'), wake=page.locator('.crayon-library-wake');
    await page.waitForFunction(()=>window.testPlayer.video.currentTime>0);
    await page.waitForTimeout(2800);
    if(!await bar.evaluate(element=>element.hidden))throw new Error('Idle menu obstructs playback');
    const opacity=await wake.evaluate(element=>getComputedStyle(element).opacity);
    if(opacity!=='0')throw new Error('Idle wake target is painted');
    const bounds=await root.boundingBox();
    if(mobile) await page.touchscreen.tap(bounds.x+bounds.width*.2,bounds.y+bounds.height*.35); else await page.mouse.move(bounds.x+20,bounds.y+20);
    await bar.waitFor({state:'visible'});
    const menu=await bar.boundingBox();
    if(Math.abs(menu.x+menu.width/2-bounds.x-bounds.width/2)>2 || Math.abs(menu.y+menu.height/2-bounds.y-bounds.height/2)>2)throw new Error('Menu is not centered');
    await page.screenshot({path:`.parser-inspection/menu-${mobile?'mobile':'desktop'}-open.png`});
    await page.mouse.move(0,0); await page.waitForTimeout(2800);
    if(!await bar.evaluate(element=>element.hidden))throw new Error('Menu did not auto-hide');
    await page.screenshot({path:`.parser-inspection/menu-${mobile?'mobile':'desktop'}-hidden.png`});
    await wake.focus(); await page.locator('[data-action="search"]').click();
    await page.waitForTimeout(2800);
    if(await page.locator('.crayon-library-panel').evaluate(element=>element.hidden))throw new Error('Search was closed by the menu timer');
    await page.locator('[data-action="close"]').click();
    await page.locator('[data-action="fullscreen"]').click();
    if(!await page.evaluate(()=>document.fullscreenElement===window.testPlayer.template.$player))throw new Error('Fullscreen root changed');
    await page.evaluate(()=>document.exitFullscreen());
    await page.evaluate(()=>window.testPlayer.library.play('https://v.qq.com/x/cover/show/episode.html','tx'));
    await page.waitForTimeout(2800);
    if(!await bar.evaluate(element=>element.hidden))throw new Error('External player menu remains visible');
    await page.frameLocator('.crayon-library-external').locator('#upstream').click();
    if(!await bar.evaluate(element=>element.hidden))throw new Error('External player controls were intercepted');
    if(mobile) await wake.tap(); else await wake.click();
    await bar.waitFor({state:'visible'});
    console.log(JSON.stringify({mobile,centered:true,autoHidden:true,wakeUnpainted:true,searchStaysOpen:true,fullscreen:true,externalWake:true}));
    await context.close();
  }
} finally {await browser.close();server.close();}
