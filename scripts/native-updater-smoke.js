async(page)=>{
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');
  const pages=native.contexts().flatMap(c=>c.pages()),main=pages.find(p=>!p.url().includes('pet=true')),pet=pages.find(p=>p.url().includes('pet=true'));
  const errors=[];main.on('pageerror',e=>errors.push(e.message));
  const invoke=(command,args={})=>main.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const before=await invoke('get_system_status');
  if(before.updates.repository!=='HEART-OF-STONE/DesktopPet')throw new Error('Default repository missing');
  await main.getByRole('button',{name:'偏好设置',exact:true}).click();
  const panel=main.getByRole('region',{name:'启动与更新'});
  await panel.getByRole('switch',{name:'自动检查更新',exact:true}).waitFor();
  if(before.updates.checkedAt){
    if(before.updates.automatic!==false)throw new Error('Automatic preference did not survive restart');
  }else{
    await panel.getByRole('switch',{name:'自动检查更新',exact:true}).click();
    await main.waitForFunction(async()=>(await window.__TAURI_INTERNALS__.invoke('get_system_status')).updates.automatic===false);
    await panel.locator('summary').filter({hasText:'更新来源'}).click();
    await panel.getByLabel('更新发布仓库').fill('https://github.com/example/testing.git');
    await panel.getByRole('button',{name:'保存更新来源',exact:true}).click();
    await panel.getByRole('button',{name:'恢复官方仓库',exact:true}).click();
    await main.waitForFunction(async()=>(await window.__TAURI_INTERNALS__.invoke('get_system_status')).updates.repository==='HEART-OF-STONE/DesktopPet');
    const first=await invoke('check_update');
    if(!first.updates.checkedAt||(!first.updates.error&&!first.updates.latest))throw new Error('Check result not recorded');
    let throttled=false;try{await invoke('check_update');}catch(e){throttled=String(e).includes('一分钟');}
    if(!throttled)throw new Error('Manual check not throttled');
  }
  for(const command of ['download_update','install_update']){
    let denied=false;try{await invoke(command);}catch{denied=true;}if(!denied)throw new Error('Unverified install/download allowed');
    const petDenied=await pet.evaluate(async command=>{try{await window.__TAURI_INTERNALS__.invoke(command);return false;}catch{return true;}},command);
    if(!petDenied)throw new Error('Pet window has update privilege');
  }
  const real=await invoke('get_system_status');
  // UI-only events exercise rendering. They never create a trusted backend update.
  const sample={...real,updates:{...real.updates,error:null,latest:{version:'0.9.1',title:'测试发布说明',notes:'仅测试 UI 的模拟版本；没有发布。',newer:true}},transfer:{phase:'downloading',downloaded:1048576,total:4194304,message:null}};
  await invoke('plugin:event|emit',{event:'system-status-changed',payload:sample});
  await panel.getByRole('progressbar',{name:'更新下载进度'}).waitFor();
  await main.getByRole('button',{name:'偏好设置',exact:true}).getByTitle('发现新版本').waitFor();
  if(!await panel.getByRole('button',{name:'检查更新',exact:true}).isDisabled())throw new Error('Check remains enabled during download');
  await panel.screenshot({path:'output/playwright/updater-download.png'});
  await invoke('plugin:event|emit',{event:'system-status-changed',payload:{...sample,transfer:{...sample.transfer,phase:'ready',message:'测试：签名验证通过'}}});
  await panel.getByRole('button',{name:'安装并重启',exact:true}).click();
  await panel.getByRole('alert').filter({hasText:'请先下载并验证更新包'}).waitFor();
  await invoke('plugin:event|emit',{event:'system-status-changed',payload:real});
  // Reject spoofed UI state at the Rust boundary, then restore the actual result.
  await main.getByRole('button',{name:/角色衣橱/}).click();
  await main.getByRole('button',{name:'偏好设置',exact:true}).click();
  await panel.getByRole('switch',{name:'自动检查更新',exact:true}).waitFor();
  await panel.screenshot({path:'output/playwright/updater-settings.png'});
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({restart:!!before.updates.checkedAt,version:real.version,repository:real.updates.repository,automatic:real.updates.automatic,result:real.updates.error||real.updates.latest.version,passed:['source binding','preferences persisted','60 second throttle','main-only commands','unverified install rejection','download progress rendering','spoofed UI cannot install']}));
}
