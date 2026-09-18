async (page) => {
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');
  const pages=native.contexts().flatMap(c=>c.pages());const main=pages.find(p=>!p.url().includes('pet=true'));const pet=pages.find(p=>p.url().includes('pet=true'));
  if(!main||!pet)throw new Error('Missing native window');
  await main.getByRole('button',{name:'Agent 看板',exact:true}).click();
  await main.waitForFunction(async()=>!!(await window.__TAURI_INTERNALS__.invoke('get_integrations')).scanAt);
  const data=await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_integrations'));
  if(data.today.total!==140||data.today.input!==110||data.today.output!==30||data.today.cached!==40)throw new Error('Codex cumulative accounting mismatch: '+JSON.stringify(data.today));
  if(await pet.locator('.pet-bubble').count())throw new Error('Historical task produced notification');
  await main.getByLabel('启用其它 Agent 的本地事件接口').check();
  await main.getByLabel('完成气泡文案').fill('{source} 完成啦，{tokens}');
  await main.getByRole('button',{name:'保存连接设置',exact:true}).click();
  await main.getByText('连接设置已保存，采集将在下次轮询更新。',{exact:true}).waitFor();
  const blocked=await pet.evaluate(async()=>{try{await window.__TAURI_INTERNALS__.invoke('set_deepseek_key',{key:'test-only-key'});return false;}catch{return true;}});
  if(!blocked)throw new Error('Pet window could alter credential');
  return {passed:['real native JSONL scan','cumulative and fork dedup','historical silence','connection settings save','pet window credential boundary']};
}
