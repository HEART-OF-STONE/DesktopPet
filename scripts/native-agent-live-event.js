async (page) => {
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');const pages=native.contexts().flatMap(c=>c.pages());const main=pages.find(p=>!p.url().includes('pet=true'));const pet=pages.find(p=>p.url().includes('pet=true'));
  await pet.locator('.pet-bubble').filter({hasText:'codex 完成啦，60 tokens'}).waitFor({timeout:20000});
  const d=await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_integrations'));
  if(d.today.total!==300)throw new Error('Live JSONL tail total mismatch');
  return {passed:['new Codex turn from appended JSONL','live completion bubble','incremental usage'],today:d.today.total};
}
