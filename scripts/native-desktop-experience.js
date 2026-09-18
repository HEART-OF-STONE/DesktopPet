async(page)=>{
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');
  const pages=native.contexts().flatMap(c=>c.pages()),main=pages.find(p=>!p.url().includes('pet=true')),pet=pages.find(p=>p.url().includes('pet=true'));
  const invoke=(command,args={})=>main.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const win=(label,command,args={})=>invoke('plugin:window|'+command,{label,...args});
  await pet.locator('.pet-art canvas').waitFor();
  const initial=(await invoke('get_snapshot')).preferences;
  await invoke('update_preferences',{patch:{ambientEnabled:false,quiet:false,scale:1,panelScale:1,panelSide:'auto',avoidFullscreen:true,petVisible:true}});
  const data=await invoke('get_integrations');
  await invoke('update_integrations',{settings:{...data.settings,petLayout:'side',showPetStatus:true}});
  const monitor=await win('main','current_monitor'),area=monitor.workArea,scale=await win('pet','scale_factor');
  const petWidth=await pet.evaluate(()=>innerWidth);
  const move=async center=>{await win('pet','set_position',{value:{Physical:{x:Math.round(center-petWidth*scale/2),y:area.position.y}}});};
  await move(area.position.x+area.size.width/2);
  await main.getByRole('button',{name:'偏好设置',exact:true}).click();
  await main.getByLabel('侧边数据框位置',{exact:true}).selectOption('right');
  await pet.locator('.panel-right').waitFor();
  const before=await pet.locator('.pet-figure').boundingBox();
  await main.getByLabel('侧边数据框位置',{exact:true}).selectOption('left');await pet.locator('.panel-left').waitFor();
  const after=await pet.locator('.pet-figure').boundingBox();if(Math.abs(before.x-after.x)>1)throw new Error('Side change moved the pet inside the window');
  await main.getByLabel('侧边数据框位置',{exact:true}).selectOption('auto');
  await move(area.position.x+area.size.width-165*scale);await pet.locator('.panel-left').waitFor();
  await move(area.position.x+165*scale);await pet.locator('.panel-right').waitFor();
  await move(area.position.x+area.size.width/2);
  await pet.evaluate(()=>document.body.style.setProperty('background','#fff','important'));
  const checks=[];
  for(const layout of ['side','bottom','compact']){
    await main.getByLabel('数据框样式',{exact:true}).selectOption(layout);
    await pet.waitForFunction(layout=>layout==='side'?!!document.querySelector('.pet-layout-side'):layout==='bottom'?!!document.querySelector('.pet-bottom-panel'):!document.querySelector('.pet-side-panel'),layout);
    let reference;
    for(const size of [0.8,1,1.25]){
      await main.getByLabel('数据框大小',{exact:true}).evaluate((e,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(value));e.dispatchEvent(new Event('input',{bubbles:true}));},size);
      await pet.waitForFunction(size=>Math.abs(Number(getComputedStyle(document.querySelector('.pet-agent-status')).zoom)-size)<.01,size);
      // Layout observers and native placement settle over the 100 ms reporting interval.
      await pet.waitForTimeout(250);
      const b=await pet.evaluate(()=>{const r=document.querySelector('.pet-agent-status').getBoundingClientRect(),p=document.querySelector('.pet-art').getBoundingClientRect();return {width:r.width,left:r.left,right:r.right,top:r.top,bottom:r.bottom,petWidth:p.width,w:innerWidth,h:innerHeight};});
      if(b.left<0||b.right>b.w+1||b.top<0||b.bottom>b.h+1)throw new Error('Clipped scaled panel '+JSON.stringify({layout,size,b}));
      if(reference&&Math.abs(b.width/size-reference.width/.8)>2)throw new Error('Scale did not change panel consistently');
      if(reference&&Math.abs(b.petWidth-reference.petWidth)>1)throw new Error('Panel scaling changed pet size');
      if(!reference)reference=b;
      checks.push({layout,size,width:b.width});
    }
    if(layout!=='compact'){
      await pet.getByRole('button',{name:'展开常显用量详情'}).click();
      await pet.waitForFunction(()=>{const s=getComputedStyle(document.querySelector('.desktop-pet')),b=document.querySelector('.pet-agent-card').getBoundingClientRect(),x=parseFloat(s.getPropertyValue('--pet-safe-left')),y=parseFloat(s.getPropertyValue('--pet-safe-top'));return b.left>=x&&b.top>=y&&b.right<=x+parseFloat(s.getPropertyValue('--pet-safe-width'))+1&&b.bottom<=y+parseFloat(s.getPropertyValue('--pet-safe-height'))+1;});
      await pet.getByRole('button',{name:'收起用量详情'}).click();
    }
    await pet.locator('.pet-layout').screenshot({path:`output/playwright/desktop-experience-${layout}.png`});
  }
  await main.getByRole('button',{name:'恢复 100%',exact:true}).click();
  await main.getByLabel('数据框样式',{exact:true}).selectOption('side');
  await main.getByLabel('侧边数据框位置',{exact:true}).selectOption('left');
  await main.locator('.settings-panel').first().screenshot({path:'output/playwright/desktop-experience-settings.png'});
  const visible=async wanted=>main.waitForFunction(async wanted=>(await window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible',{label:'pet'}))===wanted,wanted,{timeout:5000});
  try{
    await win('main','set_focus');await win('main','maximize');await main.waitForTimeout(800);await visible(true);await win('main','unmaximize');
await win('main','set_fullscreen',{value:true});await win('main','set_focus');await visible(false);
    await invoke('update_preferences',{patch:{avoidFullscreen:false}});await visible(true);
    await invoke('update_preferences',{patch:{avoidFullscreen:true}});await visible(false);
    await invoke('update_preferences',{patch:{petVisible:false}});
    await win('main','set_fullscreen',{value:false});await visible(false);
    await invoke('update_preferences',{patch:{petVisible:true}});await visible(true);
    await win('main','set_fullscreen',{value:true});await win('main','set_focus');await visible(false);
    await win('main','set_fullscreen',{value:false});await visible(true);
  }finally{await win('main','set_fullscreen',{value:false});}
  await invoke('update_preferences',{patch:{panelScale:1.1,panelSide:'left',avoidFullscreen:false}});
  const saved=(await invoke('get_snapshot')).preferences;
  if(saved.panelScale!==1.1||saved.panelSide!=='left'||saved.avoidFullscreen!==false)throw new Error('Preferences not saved');
  return {initial:{panelScale:initial.panelScale,panelSide:initial.panelSide,avoidFullscreen:initial.avoidFullscreen},saved:{panelScale:saved.panelScale,panelSide:saved.panelSide,avoidFullscreen:saved.avoidFullscreen},checks,passed:['fixed and automatic side switching','stable pet anchor','80–125 percent scaling in three layouts','screen-safe detail portals','ordinary maximize stays visible','real native fullscreen avoidance','disable avoidance while fullscreen','manual hide preserved','fullscreen exit restores']};
}
