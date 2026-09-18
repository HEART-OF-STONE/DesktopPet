async(page)=>{
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9224');
  const main=native.contexts().flatMap(c=>c.pages()).find(p=>!p.url().includes('pet=true'));
  await main.waitForFunction(()=>!!window.__TAURI_INTERNALS__);
  const invoke=(command,args={})=>main.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const status=await invoke('get_system_status');
  if(status.identifier!=='com.desktop-pet.installer-test'||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(status.version)||status.managementVisible)throw new Error('Wrong installed build or autostart opened management');
  await invoke('update_preferences',{patch:{petNames:{'doubao-static':'安装验收'},quiet:true}});
  const startup=await invoke('set_startup',{enabled:true});if(!startup.startupEnabled||!startup.startupMatches)throw new Error('Installed startup mismatch');
  return {passed:['installed app identity and version','autostart management hidden','preferences save','installed executable startup registration']};
}
