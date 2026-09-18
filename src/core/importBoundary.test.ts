import { expect,it } from 'vitest';
import { importFiles } from './packs';
it('rejects development documents before processing any role assets',async()=>{
  await expect(importFiles([new File(['# Todo'],'TODO.md'),new File(['{}'],'pet.json')])).rejects.toThrow('请移除说明或开发文件');
});
