async(page)=>{
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');
  const pages=native.contexts().flatMap(c=>c.pages()),main=pages.find(p=>!p.url().includes('pet=true')),pet=pages.find(p=>p.url().includes('pet=true'));
  const errors=[];pet.on('pageerror',e=>errors.push(e.message));
  const invoke=(command,args={})=>main.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  await main.waitForFunction(async()=>(await window.__TAURI_INTERNALS__.invoke('get_integrations')).quota.windows.length===4);
  let data=await invoke('get_integrations');if(data.settings.petLayout!=='side')throw new Error('Side default or restart persistence failed');
  let rejected=false;try{await invoke('update_integrations',{settings:{...data.settings,petLayout:'invalid-layout'}});}catch{rejected=true;}if(!rejected)throw new Error('Invalid layout accepted');
  await invoke('update_preferences',{patch:{ambientEnabled:false,quiet:false,scale:1,petVisible:true}});
  await main.getByRole('button',{name:'Agent 看板',exact:true}).click();
  await main.getByLabel('桌宠常显样式',{exact:true}).selectOption('compact');await main.getByRole('button',{name:'保存连接设置',exact:true}).click();
  await pet.waitForFunction(()=>!document.querySelector('.pet-side-panel'));
  await main.getByLabel('桌宠常显样式',{exact:true}).selectOption('side');await main.getByRole('button',{name:'保存连接设置',exact:true}).click();
  await pet.locator('.pet-side-panel').waitFor();
  data=await invoke('get_integrations');
  const now=Date.now();const fixture=JSON.parse(JSON.stringify(data));fixture.today.total=3408000;fixture.scanAt=now;
  fixture.estimate.today={usd:6.2918,records:1,unpriced:0,invalid:0};
  fixture.tasks=[{id:'side-demo',source:'codex',sessionId:'side',turnId:'side',status:'running',updatedAt:now,tokens:3408000}];
  fixture.quota.windows.forEach(w=>{w.updatedAt=now;w.resetsAt=now+3600000;if(w.bucket==='codex')w.usedPercent=w.windowMinutes===10080?34:20;});
  // Presentation-only fixtures never write to the ledger or query an account.
  const show=async value=>{await invoke('plugin:event|emit',{event:'integrations-changed',payload:value});};
  await show(fixture);await pet.locator('.pet-summary').filter({hasText:'≈$6.29'}).waitFor();
  const metrics=await pet.locator('.pet-summary-quota').allTextContents();
  if(metrics.length!==2||!metrics[0].includes('周剩余66%')||!metrics[1].includes('5h 剩余80%'))throw new Error('Incorrect quota row: '+JSON.stringify(metrics));
  const bounds=async()=>pet.evaluate(()=>{
    const nodes=[...document.querySelectorAll('.pet-art,.pet-side-panel,.pet-summary-quota,.pet-quota-track,.pet-controls')];
    return nodes.map(e=>{const r=e.getBoundingClientRect();return {name:e.className,x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,overflow:e.scrollWidth>e.clientWidth+1,windowWidth:innerWidth,windowHeight:innerHeight};});
  });
  const check=async()=>{const b=await bounds();if(b.some(r=>r.x<0||r.y<0||r.right>r.windowWidth+1||r.bottom>r.windowHeight+1||r.overflow))throw new Error('Clipped panel '+JSON.stringify(b));return b;};
  let b=await check();const pair=b.filter(r=>r.name==='pet-summary-quota');if(Math.abs(pair[0].y-pair[1].y)>1||pair[1].x<=pair[0].x)throw new Error('Quotas not on same row');
  const shortWidth=b.find(r=>String(r.name).includes('pet-quota-track')).width;
  await pet.locator('.pet-layout').screenshot({path:'output/playwright/sidepanel-dual.png'});
  // A neutral test backdrop makes the real transparent UI comparable with the
  // light-background reference. It is removed immediately and is never shipped.
  await pet.evaluate(()=>document.body.style.setProperty('background','#f7f7f1','important'));
  await pet.locator('.pet-layout').screenshot({path:'output/playwright/sidepanel-preview.png'});
  await pet.evaluate(()=>document.body.style.removeProperty('background'));
  const single=JSON.parse(JSON.stringify(fixture));single.quota.windows=single.quota.windows.filter(w=>!(w.bucket==='codex'&&w.windowMinutes===300));await show(single);
  await pet.waitForFunction(()=>document.querySelectorAll('.pet-summary-quota').length===1);
  b=await check();if(b.find(r=>String(r.name).includes('pet-quota-track')).width<shortWidth*1.8)throw new Error('Single quota did not expand');
  await pet.locator('.pet-layout').screenshot({path:'output/playwright/sidepanel-single.png'});
  const unusual=JSON.parse(JSON.stringify(fixture));unusual.quota.windows.forEach(w=>{w.usedPercent=0;w.updatedAt=now-1800000;});unusual.estimate.today={usd:99999999999.99,records:3,unpriced:1,invalid:0};unusual.today.total=999999999999;await show(unusual);
  await pet.locator('.pet-summary').filter({hasText:'≈$99,999,999,999.99'}).waitFor();await check();
  if((await pet.locator('.pet-summary').innerText()).includes('部分计价'))throw new Error('Partial pricing leaked into permanent panel');
  await pet.getByRole('button',{name:'展开常显用量详情'}).click();
  await pet.getByRole('region',{name:'桌宠用量详情'}).getByText('部分计价：当前金额仅包含已成功计价的用量。',{exact:true}).waitFor();
  await pet.getByRole('button',{name:'收起用量详情'}).click();
  if(!(await pet.locator('.pet-summary').innerText()).includes('待更新'))throw new Error('Missing stale status');
  await pet.waitForFunction(()=>document.querySelector('.pet-summary-note[title]')?.getAttribute('title')?.includes('30 分钟'));
  await pet.locator('.pet-layout').screenshot({path:'output/playwright/sidepanel-edge-values.png'});
  const empty=JSON.parse(JSON.stringify(fixture));empty.quota.windows=empty.quota.windows.filter(w=>w.bucket!=='codex');empty.estimate.today={usd:null,records:1,unpriced:1,invalid:0};await show(empty);
  await pet.locator('.pet-summary').filter({hasText:'未计价'}).waitFor();if((await pet.locator('.pet-summary').innerText()).includes('100%'))throw new Error('Spark substituted for missing main quota');await check();
  await show(fixture);await pet.getByRole('button',{name:'展开常显用量详情'}).click();await pet.getByRole('region',{name:'桌宠用量详情'}).waitFor();
  const detail=await pet.getByRole('region',{name:'桌宠用量详情'}).boundingBox();if(detail.x<0||detail.y<0)throw new Error('Detail outside window');
  await pet.getByRole('button',{name:'收起用量详情'}).click();
  const cdp=await pet.context().newCDPSession(pet);
  for(const dpr of [1,1.5,2,3]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1000,height:720,deviceScaleFactor:dpr,mobile:false});
    await pet.waitForFunction(dpr=>document.querySelector('.pet-art canvas').width===Math.round(288*dpr),dpr);
    await show(fixture);await check();
  }
  await invoke('update_preferences',{patch:{scale:1.3}});await pet.waitForFunction(()=>document.querySelector('.pet-art canvas').width===Math.round(288*1.3*3));await show(fixture);await check();
  await pet.locator('.pet-layout').screenshot({path:'output/playwright/sidepanel-300-percent.png'});
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:400,height:500,deviceScaleFactor:2,mobile:false});
  await pet.waitForFunction(()=>document.querySelector('.pet-art canvas').clientWidth<200);await show(fixture);await check();
  await cdp.send('Emulation.clearDeviceMetricsOverride');await invoke('update_preferences',{patch:{scale:1}});
  await invoke('desktop_action',{action:'reset-position'});
  const position=await pet.evaluate(async()=>({pos:await window.__TAURI_INTERNALS__.invoke('plugin:window|outer_position',{label:'pet'}),size:await window.__TAURI_INTERNALS__.invoke('plugin:window|outer_size',{label:'pet'}),monitor:await window.__TAURI_INTERNALS__.invoke('plugin:window|current_monitor',{label:'pet'})}));
  // Transparent margins may extend past the work area; visible content may not.
  const panel=await pet.locator('.pet-side-panel').boundingBox(),scale=await pet.evaluate(()=>window.__TAURI_INTERNALS__.invoke('plugin:window|scale_factor',{label:'pet'}));
  const area=position.monitor.workArea;if(area&&(position.pos.x+(panel.x+panel.width)*scale>area.position.x+area.size.width+1||position.pos.y+(panel.y+panel.height)*scale>area.position.y+area.size.height+1))throw new Error('Visible panel outside work area');
  // Interaction checks use the isolated app; direction events exercise the
  // view without moving the user's mouse or dragging a production window.
  await pet.mouse.move(4,4);
  await pet.waitForFunction(()=>getComputedStyle(document.querySelector('.pet-controls')).opacity==='0');
  await pet.locator('.pet-controls').hover();
  await pet.waitForFunction(()=>getComputedStyle(document.querySelector('.pet-controls')).opacity==='1');
  await pet.locator('.pet-layout').screenshot({path:'output/playwright/interaction-controls-visible.png'});
  await pet.mouse.move(4,4);
  await pet.getByRole('button',{name:'打开桌边',exact:true}).focus();
  await pet.waitForFunction(()=>getComputedStyle(document.querySelector('.pet-controls')).opacity==='1');
  await pet.evaluate(()=>document.activeElement.blur());
  await pet.waitForFunction(()=>getComputedStyle(document.querySelector('.pet-controls')).opacity==='0');
  await invoke('update_preferences',{patch:{bubbleOffsetX:0,bubbleOffsetY:0}});
  await invoke('trigger_action',{action:'pet'});
  await pet.locator('.pet-bubble').waitFor();
  await pet.waitForFunction(()=>{const b=document.querySelector('.pet-bubble').getBoundingClientRect(),p=document.querySelector('.pet-art').getBoundingClientRect();return b.bottom>p.top-30&&b.bottom<p.top+p.height*.4;});
  await pet.evaluate(()=>document.body.style.setProperty('background','#f7f7f1','important'));
  await pet.locator('.desktop-pet').screenshot({path:'output/playwright/interaction-bubble-default.png'});
  await main.getByRole('button',{name:'偏好设置',exact:true}).click();
  for(const [label,value] of [['气泡水平位置','24'],['气泡垂直位置','-20']]){
    await main.getByLabel(label,{exact:true}).evaluate((element,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));},value);
    await main.waitForFunction(async({label,value})=>{const p=(await window.__TAURI_INTERNALS__.invoke('get_snapshot')).preferences;return p[label==='气泡水平位置'?'bubbleOffsetX':'bubbleOffsetY']===Number(value);},{label,value});
  }
  const saved=await invoke('get_snapshot');if(saved.preferences.bubbleOffsetX!==24||saved.preferences.bubbleOffsetY!==-20)throw new Error('Bubble offset not saved');
  await main.getByRole('button',{name:'显示气泡',exact:true}).click();
  await pet.locator('.pet-bubble').waitFor();
  await pet.locator('.desktop-pet').screenshot({path:'output/playwright/interaction-bubble-adjusted.png'});
  await main.getByRole('button',{name:'恢复默认位置',exact:true}).click();
  await main.waitForFunction(async()=>{const p=(await window.__TAURI_INTERNALS__.invoke('get_snapshot')).preferences;return p.bubbleOffsetX===0&&p.bubbleOffsetY===0;});
  await pet.getByRole('button',{name:'关闭气泡'}).click();
  await pet.locator('.pet-bubble').waitFor({state:'detached'});
  for(const direction of [-1,1]){
    await invoke('plugin:event|emit',{event:'pet-drag-direction',payload:direction});
    await pet.waitForFunction(direction=>{const e=document.querySelector('.pet-art.action-drag');return e&&Math.sign(new DOMMatrix(getComputedStyle(e).transform).b)===direction;},direction);
    await pet.locator('.desktop-pet').screenshot({path:`output/playwright/interaction-drag-${direction<0?'left':'right'}.png`});
  }
  await invoke('plugin:event|emit',{event:'pet-gesture',payload:'drag'});
  await pet.waitForFunction(()=>document.querySelector('.pet-art.action-idle'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:400,height:500,deviceScaleFactor:2,mobile:false});
  await invoke('update_preferences',{patch:{bubbleOffsetX:120,bubbleOffsetY:-120,scale:1.3}});
  await invoke('trigger_action',{action:'pet'});await pet.locator('.pet-bubble').waitFor();
  await pet.waitForFunction(()=>{const b=document.querySelector('.pet-bubble').getBoundingClientRect();return b.left>=8&&b.top>=8&&b.right<=innerWidth-8&&b.bottom<=innerHeight-8;});
  await pet.locator('.desktop-pet').screenshot({path:'output/playwright/interaction-bubble-narrow.png'});
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await invoke('update_preferences',{patch:{bubbleOffsetX:0,bubbleOffsetY:0,scale:1}});
  await pet.evaluate(()=>document.body.style.removeProperty('background'));
  await invoke('refresh_integrations',{live:false});
  if(errors.length)throw new Error(errors.join('\n'));
  return {passed:['side default and persistent selection','legacy compact mode','weekly left and 5h right','independent shortened bars','single full-width bar','empty and Spark separation','large figures and stale explanations','partial pricing in details only','detail click','100/150/200/300 percent and 130 percent pet scale','narrow viewport','native reset bounds','controls hover and focus','bubble near pet and adjustable offsets','directional tilt and recovery','bubble clamped in narrow viewport'],position};
}
