async(page)=>{
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');
  const pages=native.contexts().flatMap(c=>c.pages()),main=pages.find(p=>!p.url().includes('pet=true')),pet=pages.find(p=>p.url().includes('pet=true'));
  const errors=[];pet.on('pageerror',e=>errors.push(e.message));
  const invoke=(command,args={})=>main.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const integrations=await invoke('get_integrations');await invoke('update_integrations',{settings:{...integrations.settings,petLayout:'compact'}});
  await invoke('update_preferences',{patch:{ambientEnabled:false,quiet:true,petVisible:true}});
  const cdp=await pet.context().newCDPSession(pet),results=[];
  for(const petId of ['doubao-static','doubao-sprite']){
    await invoke('update_preferences',{patch:{petId,skinId:'cream',scale:1}});
    for(const dpr of [1,1.5,2,3]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:400,height:500,deviceScaleFactor:dpr,mobile:false});
      try{await pet.waitForFunction(({dpr})=>{const c=document.querySelector('.pet-art canvas');return c&&Math.abs(window.devicePixelRatio-dpr)<0.001&&c.width===Math.round(256*dpr)&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((n,i)=>i%4===3&&n>0);},{dpr},{timeout:10000});}catch(e){throw new Error(JSON.stringify({petId,dpr,errors,observed:await pet.evaluate(()=>{const c=document.querySelector('.pet-art canvas');return {dpr:devicePixelRatio,width:c?.width,cssWidth:c?.clientWidth,hidden:document.hidden,error:document.querySelector('.asset-error')?.textContent,painted:c&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((n,i)=>i%4===3&&n>0)};})}));}
      results.push(await pet.locator('.pet-art canvas').evaluate(c=>({dpr:devicePixelRatio,width:c.width,height:c.height,cssWidth:c.clientWidth,label:c.getAttribute('aria-label')})));
      if(dpr===2)await pet.locator('.pet-art').screenshot({path:`output/playwright/hidpi-${petId}.png`});
    }
    await invoke('update_preferences',{patch:{scale:1.3}});
    await pet.waitForFunction(()=>document.querySelector('.pet-art canvas').width===Math.round(256*1.3*3));
    // MatchMedia must re-arm: return to 100% after multiple density changes.
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:400,height:500,deviceScaleFactor:1,mobile:false});
    await pet.waitForFunction(()=>document.querySelector('.pet-art canvas').width===Math.round(256*1.3));
  }
  const region=await pet.locator('.pet-art canvas').evaluate(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
  if(region.x<0||region.x+region.width>400||region.y<0||region.y+region.height>500)throw new Error('Changed logical size or pet bounds');
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  if(errors.length)throw new Error(errors.join('\n'));
  return {passed:['static and sprite native rendering at 100/150/200/300 percent','pixel density changes in same window','pet size changes resize backing canvas','logical desktop bounds unchanged'],results};
}
