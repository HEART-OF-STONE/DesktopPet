async (page)=>{
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');const main=native.contexts().flatMap(c=>c.pages()).find(p=>!p.url().includes('pet=true'));
  await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('update_preferences',{patch:{quiet:true,ambientEnabled:false}}));
  const d=await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_integrations'));if(d.inbox.length)throw new Error('Historical tasks unexpectedly filled inbox');
  return {passed:['historical inbox silence','quiet mode prepared']};
}
