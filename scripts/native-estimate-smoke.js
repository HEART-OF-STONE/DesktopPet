async(page)=>{
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');const pages=native.contexts().flatMap(c=>c.pages()),main=pages.find(p=>!p.url().includes('pet=true')),pet=pages.find(p=>p.url().includes('pet=true'));
  const invoke=(command,args={})=>main.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const before=await invoke('get_integrations');if(before.estimate.today.usd!==null)throw new Error('Unknown models priced as zero');
  const rates=[...before.estimate.rates,{source:'codex',model:'fixture-model',input:2,cached:0.5,output:10},{source:'cost-agent',model:'fixture-priced',input:2,cached:0.5,output:10}];
  await invoke('update_price_rates',{rates});
  const priced=await invoke('get_integrations');if(Math.abs(priced.estimate.today.usd-2.40046)>1e-8||priced.estimate.today.unpriced!==1||priced.retainedRecords!==before.retainedRecords)throw new Error('Wrong estimate, duplicate event, or ledger mutation');
  await main.getByRole('button',{name:'Agent 看板',exact:true}).click();const panel=main.getByRole('region',{name:'美元费用预估'});await panel.getByText('$2.4005 · 部分',{exact:true}).first().waitFor();
  await panel.locator('summary').click();await panel.getByRole('button',{name:'添加模型价格'}).click();
  await panel.getByLabel('价格 7 source',{exact:true}).fill('cost-agent');await panel.getByLabel('价格 7 model',{exact:true}).fill('fixture-unknown');
  await panel.getByRole('button',{name:'保存预估单价'}).click();await panel.getByRole('alert').filter({hasText:'填写完整单价'}).waitFor();
  for(const field of ['input','cached','output'])await panel.getByLabel(`价格 7 ${field}`,{exact:true}).fill('0');
  await panel.getByRole('button',{name:'保存预估单价'}).click();await panel.getByRole('status').waitFor();
  if((await invoke('get_integrations')).estimate.today.unpriced!==0)throw new Error('Explicit free row failed');
  await panel.getByLabel('价格 6 input',{exact:true}).fill('4');await panel.getByRole('button',{name:'保存预估单价'}).click();
  await main.waitForFunction(async()=>Math.abs((await window.__TAURI_INTERNALS__.invoke('get_integrations')).estimate.today.usd-3.60046)<1e-8);
  await panel.getByLabel('价格 6 input',{exact:true}).fill('-1');await panel.getByRole('button',{name:'保存预估单价'}).click();await panel.getByRole('alert').filter({hasText:'价格无效'}).waitFor();await panel.getByRole('button',{name:'取消价格修改'}).click();
  const denied=await pet.evaluate(async()=>{try{await window.__TAURI_INTERNALS__.invoke('update_price_rates',{rates:[]});return false;}catch{return true;}});if(!denied)throw new Error('Pet can change rates');
  await main.getByLabel('桌宠常显样式').selectOption('compact');await main.getByLabel('状态条附加指标').selectOption('estimate');await main.getByRole('button',{name:'保存连接设置',exact:true}).click();await pet.locator('.pet-status-metric').filter({hasText:'今日预估 $3.6005'}).waitFor();
  await panel.screenshot({path:'output/playwright/cost-estimate.png'});await pet.locator('.pet-agent-status').screenshot({path:'output/playwright/pet-cost-estimate.png'});
  const after=await invoke('get_integrations');if(JSON.stringify(before.today)!==JSON.stringify(after.today)||JSON.stringify(before.balance)!==JSON.stringify(after.balance)||JSON.stringify(before.quota)!==JSON.stringify(after.quota))throw new Error('Estimation changed raw usage or accounts');
  return {passed:['unknown distinct from zero','cache calculation and bridge dedup','partial subtotal warning','blank prices rejected','explicit free model','UI repricing','negative price rejected','pet command boundary','pet estimate selection','usage and accounts preserved'],usd:after.estimate.today.usd};
}
