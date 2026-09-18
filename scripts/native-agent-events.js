async (page) => {
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');const pages=native.contexts().flatMap(c=>c.pages());const main=pages.find(p=>!p.url().includes('pet=true'));const pet=pages.find(p=>p.url().includes('pet=true'));
  await pet.locator('.pet-bubble').filter({hasText:'test-agent 完成啦，100 tokens'}).waitFor();
  const data=await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_integrations'));
  if(data.today.total!==240)throw new Error('Bridge duplicate counted twice');
  if(data.demo)throw new Error('Real notification did not interrupt demo');
  await pet.locator('.pet-art.action-celebrate').waitFor();
  await main.getByRole('heading',{name:'Agent 看板',exact:true}).scrollIntoViewIfNeeded();
  await main.screenshot({path:'output/playwright/agent-dashboard-native.png'});
  await pet.screenshot({path:'output/playwright/agent-pet-notice.png',omitBackground:true});
  await main.getByRole('button',{name:'安静陪伴',exact:true}).click();
  await pet.waitForFunction(()=>!document.querySelector('.pet-bubble'));
  return {passed:['authenticated bridge','event dedup','real event interrupts demo and celebrates','pet bubble and template','quiet mode dismisses notice'],today:data.today.total};
}
