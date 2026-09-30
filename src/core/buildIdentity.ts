export type BuildChannel='stable'|'preview';
export interface BuildIdentity {version:string;buildChannel?:BuildChannel}
export const buildLabel=(channel?:BuildChannel)=>channel==='stable'?'正式版':channel==='preview'?'开发预览':'版本信息待确认';
export function releaseLabel(current:BuildIdentity,latest:{version:string;newer:boolean}){
  if(current.buildChannel==='preview')return `最新正式版 ${latest.version}`;
  if(latest.newer)return `发现新版本 ${latest.version}`;
  return current.version.replace(/^v/,'')===latest.version.replace(/^v/,'')?'当前已是最新正式版':`已发布正式版 ${latest.version}`;
}
