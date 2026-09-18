async(page)=>{
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');const main=native.contexts().flatMap(c=>c.pages()).find(p=>!p.url().includes('pet=true'));
  const status=await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_system_status'));
  if(status.managementVisible||!status.startupEnabled||!status.startupMatches)throw new Error('Autostart did not start quietly or restore setting');
  const d=await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_integrations'));if(d.inbox.length!==1||d.inbox[0].read)throw new Error('Inbox read state did not persist');
  if(!(await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('backup_status'))))throw new Error('Restore point missing after restart');
  await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('set_startup',{enabled:false}));if((await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_system_status'))).startupEnabled)throw new Error('Startup removal failed');
  return {passed:['autostart hides management window','inbox persistence','restore point persistence','startup clean removal']};
}
