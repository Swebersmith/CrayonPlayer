import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, devices } from 'playwright-core';

const inspect = process.argv.includes('--inspect');
const bundle = await readFile('dist/crayon-player.iife.js');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0;background:#0b1118;color:white;font-family:system-ui}main{padding:20px 12px}.frame{overflow:hidden;border-radius:12px}#player{width:100%;aspect-ratio:16/9}p{margin:20px 0}</style><main><p>Crayon Player · 手机测试</p><div class="frame"><div id="player"></div></div><p>播放器外页面内容</p></main><script src="/player.js"></script><script>
window.testPlayer=CrayonPlayer.createCrayonPlayer({container:'#player',url:'',enhancements:{casting:{chromecast:false}},library:{searchEndpoint:'/api/test/search',detailEndpoint:'/api/test/detail',resolveEndpoint:false,episodes:Array.from({length:40},(_,i)=>({title:'第 '+(i+1)+' 集',url:'https://www.iqiyi.com/v_episode'+(i+1)+'.html',platform:'iqiyi'}))}});
const c=document.createElement('canvas');c.width=960;c.height=540;const ctx=c.getContext('2d');setInterval(()=>{ctx.fillStyle='#152635';ctx.fillRect(0,0,960,540)},100);testPlayer.video.srcObject=c.captureStream(5);testPlayer.video.muted=true;void testPlayer.video.play();
</script></html>`;
const server=createServer((request,response)=>{
  if(request.url.startsWith('/api/test/search')) {response.setHeader('Content-Type','application/json');response.end(JSON.stringify({source:'测试目录',items:Array.from({length:10},(_,i)=>({id:'show'+i,title:'测试影片 '+(i+1),year:'2026',description:'移动端搜索结果',platforms:['iqiyi'],links:[{url:'https://www.iqiyi.com/v_episode1.html',platform:'iqiyi'}]}))}));return;}
  if(request.url.startsWith('/api/test/detail')) {response.setHeader('Content-Type','application/json');response.end(JSON.stringify({title:'测试影片',platforms:['iqiyi'],total:40,episodes:Array.from({length:40},(_,i)=>({title:'第 '+(i+1)+' 集',url:'https://www.iqiyi.com/v_episode'+(i+1)+'.html',platform:'iqiyi'}))}));return;}
  response.setHeader('Content-Type',request.url==='/player.js'?'text/javascript':'text/html; charset=utf-8');response.end(request.url==='/player.js'?bundle:html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
await mkdir('.parser-inspection',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  for(const [name,device] of [['iphone',devices['iPhone 13']],['android',devices['Pixel 5']],['small',{...devices['iPhone SE'],viewport:{width:320,height:568}}]]) {
    const context=await browser.newContext({...device,defaultBrowserType:undefined});
    const page=await context.newPage();page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://svip.qlplayer.cyou/**',route=>route.fulfill({contentType:'text/html',body:'<button id="upstream">上游播放器</button>'}));
    await page.route('https://bfq.txnp.cn/**',route=>route.fulfill({contentType:'text/html',body:'<button id="upstream">上游播放器</button>'}));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForTimeout(3000);
    await page.evaluate(()=>{window.touchLog=[];for(const type of ['pointerleave','pointerdown','pointerup','click'])testPlayer.template.$player.addEventListener(type,event=>touchLog.push({type,pointer:event.pointerType,target:event.target.closest('[data-action]')?.dataset.action}),true);testPlayer.on('control',state=>touchLog.push({control:state}));});
    const wake=page.locator('.crayon-library-wake'),bar=page.locator('.crayon-library-bar'),panel=page.locator('.crayon-library-panel');
    const inlineHeight=await page.locator('[data-player=crayon-player]').evaluate(el=>el.getBoundingClientRect().height);
    await wake.tap();await page.waitForTimeout(350);
    if(!inspect || await bar.isVisible()) await page.locator('[data-action=search]').tap();await page.waitForTimeout(450);
    const opened=await panel.isVisible();
    const metrics=await page.evaluate(()=>({artMobile:testPlayer.template.$player.classList.contains('art-mobile'),menuHidden:document.querySelector('.crayon-library-bar').hidden,panelHidden:document.querySelector('.crayon-library-panel').hidden,resultsHeight:document.querySelector('.crayon-library-results').getBoundingClientRect().height,rootHeight:testPlayer.template.$player.getBoundingClientRect().height}));
    console.log(JSON.stringify({name,opened,...metrics,errors,...(inspect?{events:await page.evaluate(()=>touchLog)}:{})}));
    await page.screenshot({path:`.parser-inspection/mobile-${name}-${inspect?'before':'after'}.png`,scale:'css'});
    if(!inspect && !opened)throw new Error(name+': real touch failed to open search');
    if(!inspect) {
      const root=page.locator('[data-player=crayon-player]');
      if(!await root.evaluate(el=>el.dataset.crayonLibraryMobile==='true'))throw new Error(name+': mobile sheet did not expand');
      if(await page.locator('.crayon-library-form input').evaluate(el=>el===document.activeElement))throw new Error(name+': search opened the keyboard without a field tap');
      const input=page.locator('.crayon-library-form input');await input.tap();await input.fill('西游记');
      await page.evaluate(()=>{
        Object.defineProperty(visualViewport,'height',{configurable:true,value:300});
        Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:40});
        visualViewport.dispatchEvent(new Event('resize'));
      });
      const keyboardBounds=await root.boundingBox();
      if(keyboardBounds.y!==40 || keyboardBounds.height!==300)throw new Error(name+': keyboard viewport was ignored');
      await page.screenshot({path:`.parser-inspection/mobile-${name}-keyboard.png`,scale:'css'});
      await page.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'));});
      await Promise.all([page.waitForResponse(response=>response.url().includes('/api/test/search')),page.locator('.crayon-library-form [type=submit]').tap()]);
      await page.waitForTimeout(300);
      if(await input.evaluate(el=>el===document.activeElement))throw new Error(name+': search did not dismiss the field');
      if(await page.locator('.crayon-library-result').count()!==10)throw new Error(name+': search results missing');
      const cdp=await context.newCDPSession(page),bounds=await panel.boundingBox();
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+bounds.width*.8,y:bounds.y+bounds.height*.8}]});
      for(let step=1;step<=12;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:bounds.x+bounds.width*.8,y:bounds.y+bounds.height*(.8-step*.045)}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(250);
      if(await panel.evaluate(el=>el.scrollTop)<40)throw new Error(name+': results did not scroll with touch');
      await page.locator('.crayon-library-result').nth(4).tap();
      await page.locator('.crayon-library-results .crayon-library-episodes button').nth(16).tap();
      await panel.waitFor({state:'hidden'});
      if(await root.evaluate(el=>el.dataset.crayonLibraryMobile==='true'))throw new Error(name+': player stayed expanded after selecting an episode');
      if(Math.abs((await root.boundingBox()).height-inlineHeight)>1)throw new Error(name+': original video height was not restored');
      const openMenu=async action=>{if(!await bar.isVisible())await wake.tap();await page.waitForTimeout(320);await page.locator(`[data-action=${action}]`).tap();await page.waitForTimeout(420);};
      await openMenu('episodes');
      if(await page.locator('.crayon-library-episode-view [aria-current=true]').textContent()!=='第 17 集')throw new Error(name+': episode touch selected the wrong page');
      const episodeBox=await page.locator('.crayon-library-episode-view .crayon-library-episodes button').first().boundingBox();
      if(episodeBox.height<44)throw new Error(name+': episode targets are too small');
      await page.screenshot({path:`.parser-inspection/mobile-${name}-episodes.png`,scale:'css'});
      await page.locator('[data-action=close]').tap();await panel.waitFor({state:'hidden'});
      await openMenu('routes');await page.locator('.crayon-library-route-choice').nth(2).tap();await panel.waitFor({state:'hidden'});
      await openMenu('search');await page.locator('[data-action=history]').tap();
      await page.getByRole('button',{name:'删除搜索记录：西游记',exact:true}).tap();
      if(await page.locator('.crayon-library-history-term').count())throw new Error(name+': history deletion failed by touch');
      await page.locator('[data-action=close]').tap();await panel.waitFor({state:'hidden'});
      await openMenu('retry');await page.frameLocator('.crayon-library-external').locator('#upstream').waitFor();
      await openMenu('fullscreen');
      if(!await page.evaluate(()=>document.fullscreenElement===testPlayer.template.$player))throw new Error(name+': fullscreen touch failed');
      await openMenu('episodes');await page.locator('[data-action=close]').tap();await panel.waitFor({state:'hidden'});
      await openMenu('fullscreen');
      await page.evaluate(()=>{for(const name of ['requestFullscreen','webkitRequestFullscreen'])Object.defineProperty(testPlayer.template.$player,name,{configurable:true,value:undefined});});
      await openMenu('fullscreen');await page.waitForTimeout(650);
      if(!await page.evaluate(()=>testPlayer.fullscreenWeb))throw new Error(name+': webpage fullscreen fallback failed');
      await openMenu('episodes');
      await page.setViewportSize({width:844,height:390});await page.waitForTimeout(350);
      const landscape=await root.boundingBox();if(landscape.width!==844 || landscape.height!==390)throw new Error(name+': sheet did not follow rotation');
      await page.locator('[data-action=close]').tap();await panel.waitFor({state:'hidden'});
      await page.setViewportSize(device.viewport);await page.waitForTimeout(350);await openMenu('fullscreen');
      if(await page.evaluate(()=>testPlayer.fullscreenWeb))throw new Error(name+': fullscreen exit failed');
      if(errors.length)throw new Error(name+': browser errors '+errors.join(', '));
      console.log(JSON.stringify({name,realTouch:true,search:true,scroll:true,episode:17,routes:true,retry:true,historyDelete:true,keyboardViewport:true,rotation:true,nativeFullscreen:true,webFullscreen:true,restored:true}));
    }
    await context.close();
  }
} finally {await browser.close();server.close();}
