async (page) => {
  const native = await page.context().browser().browserType().connectOverCDP('http://127.0.0.1:9223');
  const pages = native.contexts().flatMap(context => context.pages());
  const main = pages.find(p => !p.url().includes('pet=true'));
  const pet = pages.find(p => p.url().includes('pet=true'));
  if (!main || !pet) throw new Error('Both native windows must exist');
  const errors = [];
  main.on('pageerror', e => errors.push(e.message)); pet.on('pageerror', e => errors.push(e.message));
  await main.getByRole('button', { name: '给豆包改名', exact: true }).click();
  await main.getByText('修改默认名字', { exact: false }).click();
  await main.getByRole('textbox', { name: '默认名字', exact: true }).fill('年糕');
  await main.getByRole('button', { name: '保存名字', exact: true }).click();
  await pet.getByRole('img', { name: '年糕，静态图片', exact: true }).waitFor();
  await main.getByRole('button', { name: '给年糕改名', exact: true }).click();
  await main.getByRole('textbox', { name: '伙伴名字', exact: true }).fill('星星 🐾');
  await main.getByRole('button', { name: '保存名字', exact: true }).click();
  await pet.locator('.pet-controls span').filter({ hasText: '星星 🐾' }).waitFor();
  await pet.getByRole('img', { name: '星星 🐾，静态图片', exact: true }).waitFor();
  await main.reload();
  await main.getByRole('button', { name: '给星星 🐾改名', exact: true }).waitFor();
  const state = await main.evaluate(() => window.__TAURI_INTERNALS__.invoke('get_snapshot'));
  if (state.preferences.petNames['doubao-static'] !== '星星 🐾' || state.preferences.skinId !== 'sage') throw new Error('Native nickname or legacy preferences lost');
  const invalid = await main.evaluate(async () => {
    try { await window.__TAURI_INTERNALS__.invoke('update_preferences', { patch: { petNames: { 'doubao-static': ' ' } } }); return false; }
    catch { return true; }
  });
  if (!invalid) throw new Error('Native accepted an invalid name');
  await main.getByRole('button', { name: '给星星 🐾改名', exact: true }).click();
  await main.getByRole('button', { name: '恢复默认名', exact: true }).click();
  await pet.getByRole('img', { name: '年糕，静态图片', exact: true }).waitFor();
  await main.getByRole('button', { name: '给年糕改名', exact: true }).click();
  await main.getByRole('textbox', { name: '伙伴名字', exact: true }).fill('星星 🐾');
  await main.getByRole('button', { name: '保存名字', exact: true }).click();
  await pet.getByRole('img', { name: '星星 🐾，静态图片', exact: true }).waitFor();
  await pet.screenshot({ path: 'output/playwright/renamed-native-pet.png', omitBackground: true });
  if (errors.length) throw new Error(errors.join('\n'));
  return { passed: ['legacy state preserved', 'native save and cross-window sync', 'native invalid name rejected', 'native reset default', 'WebView reload'], petName: state.preferences.petNames['doubao-static'] };
}
