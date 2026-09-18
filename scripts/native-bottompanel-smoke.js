async(page)=>{
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');
  const pages=native.contexts().flatMap(c=>c.pages()),main=pages.find(p=>!p.url().includes('pet=true')),pet=pages.find(p=>p.url().includes('pet=true'));
  const errors=[];pet.on('pageerror',e=>errors.push(e.message));
  const invoke=(command,args={})=>main.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  await main.waitForFunction(async()=>(await window.__TAURI_INTERNALS__.invoke('get_integrations')).quota.windows.length===4);
  const initial=(await invoke('get_integrations')).settings.petLayout;
  await invoke('update_preferences',{patch:{ambientEnabled:false,quiet:false,scale:1,petVisible:true,bubbleOffsetX:0,bubbleOffsetY:0}});
  await main.getByRole('button',{name:'偏好设置',exact:true}).click();
  await main.getByLabel('数据框样式',{exact:true}).selectOption('bottom');
  await pet.locator('.pet-bottom-panel').waitFor();
  const fixture=await invoke('get_integrations'),now=Date.now();fixture.settings.petLayout='bottom';fixture.today.total=3408000;fixture.scanAt=now;fixture.estimate.today={usd:6.2918,records:1,unpriced:0,invalid:0};
  fixture.tasks=[{id:'bottom-demo',source:'codex',sessionId:'bottom',turnId:'bottom',status:'running',updatedAt:now,tokens:3408000}];
  fixture.quota.windows.forEach(w=>{w.updatedAt=now;w.resetsAt=now+3600000;if(w.bucket==='codex')w.usedPercent=w.windowMinutes===10080?34:20;});
  const show=async value=>{await invoke('plugin:event|emit',{event:'integrations-changed',payload:value});await pet.locator('.pet-bottom-panel').waitFor();};
  const check=async()=>{const result=await pet.evaluate(()=>[...document.querySelectorAll('.pet-art,.pet-bottom-panel,.pet-summary-quota,.pet-summary-metric,.pet-quota-track')].map(e=>{const r=e.getBoundingClientRect();return {name:e.className,left:r.left,top:r.top,right:r.right,bottom:r.bottom,overflow:e.scrollWidth>e.clientWidth+1,w:innerWidth,h:innerHeight};}));if(result.some(r=>r.left<0||r.top<0||r.right>r.w+1||r.bottom>r.h+1||r.overflow))throw new Error('Clipped bottom layout '+JSON.stringify(result));return result;};
  await show(fixture);await pet.locator('.pet-summary').filter({hasText:'$6.29'}).waitFor();
  if(await pet.locator('.pet-summary-metric strong').first().textContent()!=='$6.29')throw new Error('Bottom amount should omit approximation sign');
  const panelBox=await pet.locator('.pet-bottom-panel').boundingBox();if(panelBox.width>321)throw new Error('Bottom card is too wide');
  let boxes=await check(),metrics=boxes.filter(r=>r.name==='pet-summary-metric'),quotas=boxes.filter(r=>r.name==='pet-summary-quota');
  if(Math.abs(metrics[0].top-metrics[1].top)>1||metrics[1].left<=metrics[0].left||quotas[0].top<metrics[0].bottom||quotas[1].top<=quotas[0].top)throw new Error('Incorrect metric/quota layout');
  for(const selector of ['.pet-summary-label','strong']){const aligned=await pet.locator('.pet-summary-metric').evaluateAll((els,selector)=>els.map(e=>e.querySelector(selector).getBoundingClientRect().top),selector);if(Math.abs(aligned[0]-aligned[1])>1)throw new Error('Metric content must align');}
  const labels=await pet.locator('.pet-summary-quota').allTextContents();if(!labels[0].includes('周剩余66%')||!labels[1].includes('5h 剩余80%'))throw new Error('Quota order changed');
  await pet.evaluate(()=>document.body.style.setProperty('background','#fff','important'));
  await pet.locator('.pet-layout').screenshot({path:'output/playwright/bottompanel-dual.png'});
  await pet.locator('.pet-bottom-panel').screenshot({path:'output/playwright/bottompanel-card.png'});
  const single=JSON.parse(JSON.stringify(fixture));single.quota.windows=single.quota.windows.filter(w=>w.bucket!=='codex'||w.windowMinutes===10080);await show(single);
  await pet.waitForFunction(()=>document.querySelectorAll('.pet-summary-quota').length===1);await check();
  await pet.locator('.pet-layout').screenshot({path:'output/playwright/bottompanel-single.png'});
  const edge=JSON.parse(JSON.stringify(fixture));edge.estimate.today.usd=99999999999.99;edge.today.total=999999999999;edge.quota.windows.forEach(w=>w.updatedAt=now-1800000);await show(edge);
  await pet.locator('.pet-summary').filter({hasText:'待更新'}).waitFor();await check();
  await pet.locator('.pet-layout').screenshot({path:'output/playwright/bottompanel-edge.png'});
  const empty=JSON.parse(JSON.stringify(fixture));empty.quota.windows=[];empty.estimate.today={usd:null,records:0,unpriced:0,invalid:0};await show(empty);
  await pet.locator('.pet-summary-quota.is-empty').waitFor();await check();
  await pet.locator('.pet-layout').screenshot({path:'output/playwright/bottompanel-empty.png'});
  const cdp=await pet.context().newCDPSession(pet);
  for(const [width,height,dpr] of [[680,500,1],[680,500,2],[680,500,3],[360,500,2]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:false});
    await invoke('update_preferences',{patch:{scale:1.35}});await show(fixture);await check();
  }
  await pet.locator('.pet-layout').screenshot({path:'output/playwright/bottompanel-narrow.png'});
  await pet.getByRole('button',{name:'展开常显用量详情'}).click();
  const detail=await pet.getByRole('region',{name:'桌宠用量详情'}).boundingBox();if(detail.x<0||detail.y<0||detail.x+detail.width>361||detail.y+detail.height>501)throw new Error('Clipped details');
  await pet.getByRole('button',{name:'收起用量详情'}).click();
  await invoke('trigger_action',{action:'pet'});await pet.locator('.pet-bubble').waitFor();
  const bubble=await pet.locator('.pet-bubble').boundingBox();if(bubble.x<0||bubble.y<0||bubble.x+bubble.width>360)throw new Error('Clipped bubble');
  await cdp.send('Emulation.clearDeviceMetricsOverride');await invoke('update_preferences',{patch:{scale:1}});
  for(const layout of ['side','compact','bottom']){
    await main.getByLabel('数据框样式',{exact:true}).selectOption(layout);
    await main.waitForFunction(async layout=>(await window.__TAURI_INTERNALS__.invoke('get_integrations')).settings.petLayout===layout,layout);
    await pet.waitForFunction(layout=>layout==='bottom'?!!document.querySelector('.pet-bottom-panel'):layout==='side'?!!document.querySelector('.pet-layout-side'):!document.querySelector('.pet-side-panel'),layout);
  }
  await main.getByRole('button',{name:'Agent 看板',exact:true}).click();
  if(await main.getByLabel('桌宠常显样式',{exact:true}).inputValue()!=='bottom')throw new Error('Settings entry points disagree');
  await invoke('refresh_integrations',{live:false});
  if(errors.length)throw new Error(errors.join('\n'));
  return {initialLayout:initial,savedLayout:(await invoke('get_integrations')).settings.petLayout,passed:['settings immediate switch','metric columns','stacked weekly and 5h','single quota','long values and stale notes','DPR 1/2/3 and narrow viewport','135 percent pet scale','details and bubble bounds','three layouts and synchronized settings']};
}
