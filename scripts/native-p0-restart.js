async (page) => {
  const native=await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');
  const pages=native.contexts().flatMap(c=>c.pages());const main=pages.find(p=>!p.url().includes('pet=true'));const pet=pages.find(p=>p.url().includes('pet=true'));
  const s=await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_snapshot'));const d=await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_integrations'));
  if(!s.preferences.ambientEnabled||s.preferences.ambientFrequency!=='low'||s.preferences.ambientRange!=='small')throw new Error('Ambient settings not restored');
  if(d.connection.testedAt||d.connection.lastEventAt||d.demo)throw new Error('Old connection/demo replayed on restart');
  await pet.locator('.pet-art.action-idle').waitFor();
  return {passed:['ambient settings survive full restart','probe and connection observations reset each process','no autonomous replay']};
}
