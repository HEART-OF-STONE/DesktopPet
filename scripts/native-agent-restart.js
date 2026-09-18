async (page) => {
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');const pages=native.contexts().flatMap(c=>c.pages());const main=pages.find(p=>!p.url().includes('pet=true'));const pet=pages.find(p=>p.url().includes('pet=true'));
  await main.getByRole('button',{name:'Agent 看板',exact:true}).click();
  const data=await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_integrations'));
  if(data.today.total!==240||!data.settings.bridgeEnabled||data.settings.completionTemplate!=='{source} 完成啦，{tokens}')throw new Error('Native persistence mismatch');
  if(!data.settings.showPetStatus||data.settings.petMetric!=='quota'||data.demo)throw new Error('Status settings or ephemeral demo persistence mismatch');
  await pet.waitForTimeout(1800);if(await pet.locator('.pet-bubble').count())throw new Error('Restart replayed notification');
  return {passed:['process restart persists settings and totals','restart notification silence']};
}
