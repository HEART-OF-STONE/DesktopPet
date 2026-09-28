async(page)=>{
  const browser=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9227');
  const pages=browser.contexts().flatMap(c=>c.pages());
  const main=pages.find(p=>!p.url().includes('pet=true')),pet=pages.find(p=>p.url().includes('pet=true'));
  const invoke=(command,args={})=>main.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const original=await invoke('get_integrations');
  const show=data=>invoke('plugin:event|emit',{event:'integrations-changed',payload:data});
  const data=JSON.parse(JSON.stringify(original)),now=Date.now();
  data.settings.codexEnabled=true;data.settings.showPetStatus=true;data.settings.bridgeEnabled=false;
  data.scanAt=now;data.scanPending=false;data.scanError=null;
  const task=(status,at=now,turnId=status)=>({id:`test:${turnId}`,source:'codex',sessionId:'synthetic-session',turnId,status,updatedAt:at,tokens:null});
  const states=[['running','工作中','rgb(79, 135, 179)'],['completed','刚刚完成','rgb(96, 150, 79)'],
    ['waiting','等待确认','rgb(196, 146, 58)'],['failed','任务出错','rgb(189, 98, 88)'],
    ['interrupted','已中断','rgb(145, 149, 139)'],['idle','暂无活跃任务','rgb(145, 149, 139)'],
    ['stale','状态待核实','rgb(145, 149, 139)']];
  try{
    await main.getByRole('button',{name:'Agent 看板',exact:true}).click();
    for(const layout of ['side','bottom','compact']){
      data.settings.petLayout=layout;
      for(const [kind,label,color] of states){
        data.tasks=kind==='idle'?[]:[task(kind==='stale'?'running':kind,kind==='stale'?now-31*60000:now)];
        await show(data);
        const indicator=pet.locator(`.pet-agent-status.status-${kind}`);
        await indicator.waitFor();
        if(!(await indicator.locator('.pet-status-trigger').innerText()).includes(label))throw new Error('Incorrect state label');
        const actual=await indicator.locator('.pet-status-trigger>i').evaluate(e=>getComputedStyle(e).backgroundColor);
        if(actual!==color)throw new Error(`${layout}/${kind}: unexpected dot ${actual}`);
        if(layout==='bottom'&&['running','completed','idle'].includes(kind))await indicator.locator('.pet-status-trigger').screenshot({path:`output/playwright/agent-status-${kind}.png`});
      }
    }
    data.settings.petLayout='bottom';
    data.tasks=[task('running',now-15*3600000,'old'),task('completed',now-3*3600000,'new')];
    await show(data);await pet.locator('.pet-agent-status.status-idle').waitFor();
    if(await main.locator('.agent-task').count()!==2)throw new Error('Historical tasks disappeared');
    const activeMetric=main.locator('.agent-metrics').getByText('最近活跃任务',{exact:true}).locator('..');
    await activeMetric.getByText('0',{exact:true}).waitFor();
    data.tasks=[task('waiting',now-60000,'old'),task('running',now,'new')];
    await show(data);await pet.locator('.pet-agent-status.status-running').waitFor();
    await activeMetric.getByText('1',{exact:true}).waitFor();
    return {layouts:3,statesPerLayout:7,colorsConsistent:true,supersededTurnsExcluded:true,historyPreserved:true,activeCountConsistent:true};
  }finally{await show(original);}
}
