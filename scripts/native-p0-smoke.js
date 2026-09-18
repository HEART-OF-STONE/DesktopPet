async (page) => {
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');
  const pages=native.contexts().flatMap(c=>c.pages());const main=pages.find(p=>!p.url().includes('pet=true'));const pet=pages.find(p=>p.url().includes('pet=true'));
  const errors=[];main.on('pageerror',e=>errors.push(e.message));pet.on('pageerror',e=>errors.push(e.message));
  await pet.waitForFunction(()=>!document.querySelector('.pet-bubble'),null,{timeout:15000});
  await main.getByRole('button',{name:'Agent 看板',exact:true}).click();
  const getData=()=>main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_integrations'));
  const before=await getData();const signature=d=>JSON.stringify({today:d.today,week:d.week,tasks:d.tasks,balance:d.balance});
  await main.getByRole('button',{name:'测试本机通道',exact:true}).click();
  await main.getByText('本机通道测试通过，已发送一次演示；真实任务和用量未改变。',{exact:true}).waitFor();
  await pet.locator('.pet-art.action-celebrate').waitFor();
  const after=await getData();if(signature(before)!==signature(after)||!after.connection.testedAt||after.connection.lastSource!==before.connection.lastSource)throw new Error('Probe changed records or impersonated Agent');
  await main.getByRole('button',{name:'停止演示',exact:true}).click();
  await main.getByRole('button',{name:'重新检查日志',exact:true}).click();
  await main.getByText('本机日志检查完成，请查看检测结果。',{exact:true}).waitFor();
  await main.getByRole('region',{name:'联动接入助手'}).screenshot({path:'output/playwright/connection-assistant.png'});
  const blocked=await pet.evaluate(async()=>{try{await window.__TAURI_INTERNALS__.invoke('test_agent_connection');return false;}catch{return true;}});if(!blocked)throw new Error('Pet can run management diagnostics');
  await main.evaluate(async()=>{const d=await window.__TAURI_INTERNALS__.invoke('get_integrations');await window.__TAURI_INTERNALS__.invoke('update_integrations',{settings:{...d.settings,bridgeEnabled:false,codexEnabled:false}});});
  await main.getByRole('button',{name:'开启事件接口',exact:true}).click();
  await main.getByRole('button',{name:'测试本机通道',exact:true}).waitFor();
  await main.evaluate(async()=>{const d=await window.__TAURI_INTERNALS__.invoke('get_integrations');await window.__TAURI_INTERNALS__.invoke('update_integrations',{settings:{...d.settings,bridgeEnabled:false,codexEnabled:false}});});
  await pet.locator('.pet-art.action-idle').waitFor();
  await main.getByRole('button',{name:'偏好设置',exact:true}).click();
  await main.getByLabel('自主陪伴频率').selectOption('lively');
  await main.getByLabel('自主陪伴范围').selectOption('medium');
  for(const [label,motion] of [['伸懒腰','stretch'],['四处看看','look'],['打盹','doze'],['挪一挪','stroll']]){
    await main.getByRole('button',{name:label,exact:true}).click();await pet.locator(`.pet-art.action-${motion}`).waitFor();await main.locator(`.ambient-preview .action-${motion}`).waitFor();
  }
  await main.getByRole('region',{name:'自主陪伴设置'}).screenshot({path:'output/playwright/autonomous-companion.png'});
  await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('update_preferences',{patch:{scale:1.35}}));
  await main.getByRole('button',{name:'挪一挪',exact:true}).click();
  for(let i=0;i<10;i++){await pet.waitForTimeout(400);const b=await pet.locator('.pet-art').boundingBox();const w=await pet.evaluate(()=>innerWidth);if(b.x<0||b.x+b.width>w)throw new Error('Ambient movement leaves window at max scale');}
  await main.getByRole('button',{name:'停止',exact:true}).click();
  await pet.locator('.pet-art.action-idle').waitFor();
  await pet.waitForFunction(()=>!!document.querySelector('.pet-art.action-stretch,.pet-art.action-look,.pet-art.action-doze,.pet-art.action-stroll'),null,{timeout:50000});
  await main.getByRole('button',{name:'安静陪伴',exact:true}).click();await pet.locator('.pet-art.action-idle').waitFor();
  if(await main.getByRole('button',{name:'打盹',exact:true}).isEnabled())throw new Error('Quiet mode still permits ambient preview');
  await main.getByRole('button',{name:'免打扰中',exact:true}).click();
  await main.getByRole('button',{name:'打盹',exact:true}).click();await pet.locator('.pet-art.action-doze').waitFor();
  await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('trigger_action',{action:'pet'}));await pet.locator('.pet-art.action-pet').waitFor();
  await pet.locator('.pet-art.action-idle').waitFor();
  await main.getByRole('button',{name:'打盹',exact:true}).click();await pet.locator('.pet-art.action-doze').waitFor();
  await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('demo_agent',{kind:'running'}));await pet.locator('.pet-art.action-thinking').waitFor();
  await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('demo_agent',{kind:'stop'}));
  await main.getByRole('button',{name:'打盹',exact:true}).click();
  await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('update_preferences',{patch:{petVisible:false}}));
  await pet.waitForFunction(()=>!!document.querySelector('.pet-art.action-idle'));
  await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('update_preferences',{patch:{petVisible:true,scale:1}}));await pet.locator('.pet-art.action-idle').waitFor();
  await main.getByLabel('开启自主陪伴').click();
  await main.waitForFunction(()=>!document.querySelector('.ambient-panel input[type="checkbox"]').checked);
  await main.getByLabel('开启自主陪伴').click();
  await main.waitForFunction(()=>document.querySelector('.ambient-panel input[type="checkbox"]').checked);
  await main.getByLabel('自主陪伴频率').selectOption('low');await main.getByLabel('自主陪伴范围').selectOption('small');
  const invalid=await main.evaluate(async()=>{try{await window.__TAURI_INTERNALS__.invoke('update_preferences',{patch:{ambientRange:'unlimited'}});return false;}catch{return true;}});if(!invalid)throw new Error('Invalid range accepted');
  if(errors.length)throw new Error(errors.join('\n'));
  return {passed:['real loopback probe without record changes','connection detection and enabling','management command boundary','four synchronized ambient previews','max-scale movement bounds','automatic local scheduling','quiet/hide/interaction/Agent interruption','native preference validation']};
}
