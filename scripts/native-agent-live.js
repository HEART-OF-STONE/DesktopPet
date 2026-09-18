async (page) => {
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');const pages=native.contexts().flatMap(c=>c.pages());const main=pages.find(p=>!p.url().includes('pet=true'));const pet=pages.find(p=>p.url().includes('pet=true'));
  await main.getByRole('button',{name:'Agent 看板',exact:true}).click();
  await main.waitForFunction(async()=>{const d=await window.__TAURI_INTERNALS__.invoke('get_integrations');return d.scanAt||d.scanError;},null,{timeout:60000});
  const d=await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_integrations'));
  if(d.scanError)throw new Error(d.scanError);if(!d.scannedFiles||!d.retainedRecords)throw new Error('No real local usage loaded: '+JSON.stringify({home:d.detectedHome,at:d.scanAt,files:d.scannedFiles,records:d.retainedRecords}));
  if(await pet.locator('.pet-bubble').count())throw new Error('Real history replayed');
  await main.screenshot({path:'output/playwright/agent-dashboard-real-local.png'});
  return {source:'real local Codex logs, read only',scannedFiles:d.scannedFiles,records:d.retainedRecords,today:d.today,quotaWindows:d.quota.windows.length,quotaSource:d.quota.source,scanError:d.scanError};
}
