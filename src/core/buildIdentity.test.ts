import {describe,it,expect} from 'vitest';
import {buildLabel,releaseLabel} from './buildIdentity';
describe('running version and published version',()=>{
 it('does not label a preview as the latest official release',()=>{expect(buildLabel('preview')).toBe('开发预览');expect(releaseLabel({version:'0.9.6',buildChannel:'preview'},{version:'0.9.5',newer:false})).toBe('最新正式版 0.9.5');});
 it('labels matching, newer and unpublished local releases accurately',()=>{expect(releaseLabel({version:'0.9.6',buildChannel:'stable'},{version:'v0.9.6',newer:false})).toBe('当前已是最新正式版');expect(releaseLabel({version:'0.9.5',buildChannel:'stable'},{version:'0.9.6',newer:true})).toBe('发现新版本 0.9.6');expect(releaseLabel({version:'0.9.6',buildChannel:'stable'},{version:'0.9.5',newer:false})).toBe('已发布正式版 0.9.5');expect(buildLabel()).toBe('版本信息待确认');});
});
