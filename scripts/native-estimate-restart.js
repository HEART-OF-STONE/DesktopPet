async(page)=>{
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');const pages=native.contexts().flatMap(c=>c.pages()),main=pages.find(p=>!p.url().includes('pet=true')),pet=pages.find(p=>p.url().includes('pet=true'));
  await main.waitForFunction(async()=>{const d=await window.__TAURI_INTERNALS__.invoke('get_integrations');return d.settings.petMetric==='estimate'&&Math.abs(d.estimate.today.usd-3.60046)<1e-8&&d.estimate.today.unpriced===0&&d.estimate.rates.length===7;});
  await pet.locator('.pet-status-metric').filter({hasText:'今日预估 $3.6005'}).waitFor();
  return {passed:['saved custom rates survive process restart','estimate not doubled on historical rescan','pet metric survives restart']};
}
