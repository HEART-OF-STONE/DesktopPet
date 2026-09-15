async (page) => {
  const native = await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');
  const pages = native.contexts().flatMap(context => context.pages());
  const main = pages.find(p => !p.url().includes('pet=true'));
  const pet = pages.find(p => p.url().includes('pet=true'));
  if (!main || !pet) throw new Error('Both native windows must exist after restart');
  await main.getByRole('button', { name: '给星星 🐾改名', exact: true }).waitFor();
  await pet.getByRole('img', { name: '星星 🐾，静态图片', exact: true }).waitFor();
  const state = await main.evaluate(() => window.__TAURI_INTERNALS__.invoke('get_snapshot'));
  if (state.preferences.skinId !== 'sage') throw new Error('Restart lost unrelated preferences');
  if (state.preferences.petDefaultNames['doubao-static'] !== '年糕') throw new Error('Restart lost custom default name');
  await main.getByRole('button', { name: '给星星 🐾改名', exact: true }).click();
  await main.getByRole('button', { name: '恢复默认名', exact: true }).click();
  await pet.getByRole('img', { name: '年糕，静态图片', exact: true }).waitFor();
  return { passed: ['full process restart preserved nickname and skin', 'both native windows restored the nickname'] };
}
