async (page) => {
  const root = '.';
  await page.evaluate(() => localStorage.removeItem('desktop-pet-preview-v1'));
  await page.reload();
  await page.getByRole('button', { name: '角色衣橱 2', exact: true }).click();
  const cases = [
    { name: '豆包 · 精灵图示例', files: ['pet.json', 'idle.png', 'pet.png'].map(f => `${root}/examples/sprite-sheet/${f}`) },
    { name: '豆包 · PNG 序列示例', files: ['pet.json', ...Array.from({ length: 12 }, (_, i) => `待机-${String(i + 1).padStart(2, '0')}.png`)].map(f => `${root}/examples/png-sequence/${f}`) },
  ];
  const passed = [];
  for (const example of cases) {
    await page.getByLabel('选择角色图片或角色包文件').setInputFiles(example.files);
    await page.getByRole('heading', { name: example.name, exact: true }).waitFor();
    await page.getByRole('button', { name: '我的伙伴', exact: true }).click();
    await page.getByRole('img', { name: `${example.name}，逐帧动画`, exact: true }).waitFor();
    await page.waitForTimeout(180);
    const first = await page.locator('.stage-character canvas').evaluate(c => c.toDataURL());
    await page.waitForTimeout(250);
    const second = await page.locator('.stage-character canvas').evaluate(c => c.toDataURL());
    if (first === second) throw new Error(`${example.name}: frames did not change`);
    await page.getByRole('button', { name: '摸摸头', exact: true }).click();
    await page.locator('.preview-bubble').waitFor();
    await page.waitForTimeout(1300);
    // The sequence example contains no pet clip: the idle fallback must remain visible.
    if (await page.locator('.asset-error').count()) throw new Error(`${example.name}: failed action fallback`);
    await page.reload();
    await page.getByRole('img', { name: `${example.name}，逐帧动画`, exact: true }).waitFor();
    await page.getByRole('button', { name: '角色衣橱 3', exact: true }).click();
    await page.getByRole('button', { name: `移除${example.name}`, exact: true }).click();
    passed.push(`${example.name}: import, playback, action fallback, persistence`);
  }
  // An invalid pack must leave the currently selected pet usable.
  await page.getByLabel('选择角色图片或角色包文件').setInputFiles(`${root}/scripts/fixtures/unsupported-renderer.json`);
  await page.getByText('首版支持静态图片与逐帧 2D', { exact: true }).waitFor();
  if (await page.locator('.pet-card').count() !== 2) throw new Error('Invalid import modified the wardrobe');
  passed.push('invalid renderer rejected without changing wardrobe');
  return { passed };
}
