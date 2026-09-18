async(page)=>{
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');
  const pages=native.contexts().flatMap(c=>c.pages()),main=pages.find(p=>!p.url().includes('pet=true')),pet=pages.find(p=>p.url().includes('pet=true'));
  const invoke=(command,args={})=>main.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  await pet.locator('.pet-art canvas').waitFor();
  await invoke('update_preferences',{patch:{ambientEnabled:false,quiet:false,scale:1,petVisible:true}});
  const data=await invoke('get_integrations');
  const results=[];
  for(const layout of ['side','bottom','compact']){
    await invoke('update_integrations',{settings:{...data.settings,petLayout:layout,showPetStatus:true}});
    await pet.waitForFunction(layout=>layout==='side'?!!document.querySelector('.pet-layout-side'):layout==='bottom'?!!document.querySelector('.pet-bottom-panel'):!document.querySelector('.pet-side-panel'),layout);
    await pet.waitForFunction(()=>getComputedStyle(document.querySelector('.desktop-pet')).getPropertyValue('--pet-safe-width'));
    await invoke('desktop_action',{action:'reset-position'});
    await pet.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.desktop-pet')).getPropertyValue('--pet-safe-right'))>20);
    const geometry=await pet.evaluate(async()=>{
      const invoke=window.__TAURI_INTERNALS__.invoke;
      const pos=await invoke('plugin:window|outer_position',{label:'pet'}),monitor=await invoke('plugin:window|current_monitor',{label:'pet'}),scale=await invoke('plugin:window|scale_factor',{label:'pet'});
      const panel=document.querySelector('.pet-agent-status').getBoundingClientRect();
      return {pos,area:monitor.workArea,scale,panelRight:panel.right};
    });
    if(layout!=='compact'){
      const gap=geometry.area.position.x+geometry.area.size.width-(geometry.pos.x+geometry.panelRight*geometry.scale);
      if(gap<0||gap>10*geometry.scale)throw new Error('Visible panel cannot reach edge '+JSON.stringify({layout,gap,geometry}));
      await pet.getByRole('button',{name:'展开常显用量详情'}).click();
      await pet.waitForFunction(()=>{const root=getComputedStyle(document.querySelector('.desktop-pet')),card=document.querySelector('.pet-agent-card').getBoundingClientRect(),left=parseFloat(root.getPropertyValue('--pet-safe-left')),top=parseFloat(root.getPropertyValue('--pet-safe-top')),w=parseFloat(root.getPropertyValue('--pet-safe-width')),h=parseFloat(root.getPropertyValue('--pet-safe-height'));return card.left>=left&&card.top>=top&&card.right<=left+w+1&&card.bottom<=top+h+1;});
      await pet.getByRole('button',{name:'收起用量详情'}).click();
    }
    await invoke('trigger_action',{action:'pet'});await pet.locator('.pet-bubble').waitFor();
    await pet.waitForFunction(()=>{const root=getComputedStyle(document.querySelector('.desktop-pet')),b=document.querySelector('.pet-bubble').getBoundingClientRect(),left=parseFloat(root.getPropertyValue('--pet-safe-left')),top=parseFloat(root.getPropertyValue('--pet-safe-top')),w=parseFloat(root.getPropertyValue('--pet-safe-width')),h=parseFloat(root.getPropertyValue('--pet-safe-height'));return b.left>=left&&b.top>=top&&b.right<=left+w+1&&b.bottom<=top+h+1;});
    await pet.getByRole('button',{name:'关闭气泡'}).click();
    for(const direction of [-1,1]){
      await invoke('plugin:event|emit',{event:'pet-drag-direction',payload:direction});
      await pet.waitForFunction(direction=>{const e=document.querySelector('.pet-art.action-drag');return e&&Math.sign(new DOMMatrix(getComputedStyle(e).transform).b)===direction;},direction);
      const began=Date.now();await invoke('plugin:event|emit',{event:'pet-gesture',payload:'drag'});
      await pet.waitForFunction(()=>!!document.querySelector('.pet-art.action-idle'),null,{timeout:1000});
      const elapsed=Date.now()-began;if(elapsed>800)throw new Error('Slow drag recovery '+elapsed);
      results.push({layout,direction,recoveryMs:elapsed});
    }
  }
  // Visible edge placement must survive periodic offscreen recovery.
  const before=await pet.evaluate(()=>window.__TAURI_INTERNALS__.invoke('plugin:window|outer_position',{label:'pet'}));
  await pet.waitForTimeout(10500);
  const after=await pet.evaluate(()=>window.__TAURI_INTERNALS__.invoke('plugin:window|outer_position',{label:'pet'}));
  if(before.x!==after.x||before.y!==after.y)throw new Error('Idle recovery unexpectedly moved the pet');
  return {passed:['visible edge placement in three layouts','screen-safe details and bubble','rapid left/right release','periodic recovery preserves placement'],results};
}
