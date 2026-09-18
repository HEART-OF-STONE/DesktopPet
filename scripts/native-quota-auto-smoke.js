async(page)=>{
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');
  const pages=native.contexts().flatMap(c=>c.pages()),main=pages.find(p=>!p.url().includes('pet=true')),pet=pages.find(p=>p.url().includes('pet=true'));
  const invoke=(command,args={})=>main.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  await main.waitForFunction(async()=>{const d=await window.__TAURI_INTERNALS__.invoke('get_integrations');return d.quota.source==='app_server'&&d.quotaRefresh.lastAttemptAt;});
  const before=await invoke('get_integrations');
  const results=await Promise.all([1,2,3].map(()=>invoke('refresh_integrations',{live:true})));
  if(results.some(r=>r.quotaRefresh.lastAttemptAt!==before.quotaRefresh.lastAttemptAt))throw new Error('Manual request bypassed cooldown');
  await main.getByRole('button',{name:'Agent 看板',exact:true}).click();
  if(!await main.getByRole('button',{name:'查询冷却中',exact:true}).isDisabled())throw new Error('Cooldown button not disabled');
  await pet.getByRole('button',{name:'展开常显用量详情'}).click();
  const detail=pet.getByRole('region',{name:'桌宠用量详情'});
  await detail.getByText('自动查询：最多每 10 分钟一次；日志额度较新时延后。',{exact:false}).waitFor();
  if(!(await detail.innerText()).includes('70%'))throw new Error('Automatic quota did not reach pet');
  await pet.screenshot({path:'output/playwright/quota-auto-details.png'});
  return {passed:['automatic startup query','manual concurrent cooldown','next schedule in details','updated quota in pet'],lastAttemptAt:before.quotaRefresh.lastAttemptAt};
}
