async (page) => {
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');const pages=native.contexts().flatMap(c=>c.pages());const main=pages.find(p=>!p.url().includes('pet=true'));const pet=pages.find(p=>p.url().includes('pet=true'));
  const data=await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_integrations'));
  if(!data.tasks.some(t=>t.source==='test-agent'&&t.status==='waiting'))throw new Error('Waiting event missing');
  if(await pet.locator('.pet-bubble').count())throw new Error('Quiet mode displayed notification');
  await main.getByRole('button',{name:'免打扰中',exact:true}).click();
  await pet.waitForTimeout(2200);
  if(await pet.locator('.pet-bubble').count())throw new Error('Quiet notifications replayed');
  const denied=await main.evaluate(async()=>{try{const s=(await window.__TAURI_INTERNALS__.invoke('get_integrations')).settings;s.codexHome='relative/path';await window.__TAURI_INTERNALS__.invoke('update_integrations',{settings:s});return false;}catch{return true;}});
  if(!denied)throw new Error('Invalid path accepted');
  await main.reload();await main.getByRole('button',{name:'Agent 看板',exact:true}).click();
  return {passed:['waiting status','quiet drop and no replay','invalid path rejected','WebView reload']};
}
