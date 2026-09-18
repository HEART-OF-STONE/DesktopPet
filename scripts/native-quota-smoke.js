async (page) => {
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');
  const pages=native.contexts().flatMap(c=>c.pages());
  const main=pages.find(p=>!p.url().includes('pet=true'));const pet=pages.find(p=>p.url().includes('pet=true'));
  if(!main||!pet)throw new Error('Missing native windows');
  await main.waitForFunction(async()=>(await window.__TAURI_INTERNALS__.invoke('get_integrations')).quota.windows.length===4);
  const before=await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_integrations'));
  const mainTime=before.quota.windows.find(w=>w.bucket==='codex').updatedAt;
  const sparkTime=before.quota.windows.find(w=>w.bucket==='codex_bengalfox').updatedAt;
  if(!(mainTime<sparkTime))throw new Error('Bucket observation times were overwritten');
  await main.getByRole('button',{name:'Agent 看板',exact:true}).click();
  const rows=await main.locator('.quota-window').allTextContents();
  if(rows.length!==4||!rows[0].includes('Codex 主额度 · 5 小时')||!rows[1].includes('Codex 主额度 · 7 天')||!rows[2].includes('GPT-5.3-Codex-Spark · 5 小时')||!rows[3].includes('GPT-5.3-Codex-Spark · 7 天'))throw new Error('Quota ordering or naming failed: '+JSON.stringify(rows));
  await main.getByLabel('桌宠常显样式',{exact:true}).selectOption('compact');
  await main.getByLabel('状态条附加指标',{exact:true}).selectOption('quota');
  await main.getByRole('button',{name:'保存连接设置',exact:true}).click();
  await pet.waitForFunction(()=>document.querySelector('.pet-status-metric')?.textContent.includes('5 小时剩余 76% / 7 天剩余 76%'));
  const trigger=pet.getByRole('button',{name:'桌宠任务状态',exact:true});
  if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();
  const card=pet.getByRole('region',{name:'桌宠用量详情'});
  const detail=await card.innerText();
  if(!detail.includes('Codex 主额度 · 5 小时')||!detail.includes('Codex 主额度 · 7 天')||!detail.includes('GPT-5.3-Codex-Spark · 7 天'))throw new Error('Pet detail dropped a quota window');
  await main.locator('.quota-window').first().scrollIntoViewIfNeeded();
  await main.screenshot({path:'output/playwright/quota-buckets.png'});
  await card.screenshot({path:'output/playwright/pet-quota-buckets.png'});
  const after=await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_integrations'));
  if(after.today.total!==before.today.total||after.quota.windows.length!==4)throw new Error('Display changed usage');
  return {passed:['four windows retained','Plus main 5h and 7d first','Spark friendly name','per-bucket timestamp','pet metric and all detail rows'],rows};
}
