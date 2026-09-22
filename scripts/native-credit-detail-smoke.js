async(page)=>{
  const browser=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9227');
  const pages=browser.contexts().flatMap(c=>c.pages());
  const pet=pages.find(p=>p.url().includes('pet=true'));
  const invoke=(command,args={})=>pet.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const original=await invoke('get_integrations');
  const show=data=>invoke('plugin:event|emit_to',{target:{kind:'AnyLabel',label:'pet'},event:'integrations-changed',payload:data});
  const data=JSON.parse(JSON.stringify(original)),now=Date.now();
  data.settings.codexEnabled=true;data.settings.creditUsdRate=0.04;
  data.quota.windows=[
    {bucket:'codex',label:'secondary',windowMinutes:10080,usedPercent:30,resetsAt:null,updatedAt:now,source:'local_log'},
    {bucket:'spark',label:'primary',windowMinutes:300,usedPercent:0,resetsAt:now-1000,updatedAt:now-86400000,source:'local_log'},
  ];
  data.quota.credits={codex:{balance:1234.5,unlimited:false,hasCredits:true,updatedAt:now,source:'local_log'}};
  const detail=pet.getByRole('region',{name:'桌宠用量详情'});
  try{
    await show(data);
    if(!await detail.isVisible())await pet.getByRole('button',{name:'展开常显用量详情'}).click();
    const credit=detail.locator('.pet-credit-detail'),older=detail.locator('.pet-older-quotas');
    await credit.getByText('$49.38',{exact:true}).waitFor();
    await credit.getByText('积分',{exact:true}).waitFor();
    if(!(await credit.locator('summary').innerText()).includes('='))throw new Error('Missing fixed-rate equality');
    if(await credit.evaluate(e=>e.open)||await older.evaluate(e=>e.open))throw new Error('Disclosures should default closed');
    if(await older.getByText('上次剩余 100%',{exact:true}).isVisible())throw new Error('Stale quota should be hidden');
    await older.locator('summary').focus();await pet.keyboard.press('Enter');
    await older.getByText('上次剩余 100%',{exact:true}).waitFor();
    await older.locator('summary').click();
    await credit.locator('summary').focus();await pet.keyboard.press('Enter');
    await credit.getByText('非现金余额',{exact:false}).waitFor();
    await credit.locator('summary').click();
    for(const [balance,unlimited,raw,usd] of [[0,false,'0','$0.00'],[-2,false,'-2','-$0.08'],[null,false,'—',null],[null,true,'不限量',null],[123456789.12345678,false,'123,456,789.12345678','$4,938,271.56']]){
      data.quota.credits.codex={...data.quota.credits.codex,balance,unlimited};
      await show(data);await credit.getByText(raw,{exact:true}).waitFor();
      if(usd)await credit.getByText(usd,{exact:true}).waitFor();
      else if(await credit.locator('.pet-credit-equivalent').count())throw new Error('Unknown/unlimited should not show a numeric conversion');
      await detail.evaluate(e=>e.style.width='240px');
      if(!await credit.locator('summary').evaluate(e=>e.scrollWidth<=e.clientWidth+1))throw new Error('Credit row overflows a narrow panel');
    }
    await detail.evaluate(e=>e.style.removeProperty('width'));
    return {passed:['combined values','old supplementary quotas folded','keyboard disclosure','zero and negative balances','unknown and unlimited','long values at 240px']};
  }finally{
    await show(original);
    await detail.evaluate(e=>e.style.removeProperty('width'));
    if(await detail.isVisible())await detail.getByRole('button',{name:'收起用量详情'}).click();
  }
}
