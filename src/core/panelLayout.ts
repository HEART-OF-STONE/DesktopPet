import type { Preferences } from './types';
export type PanelSide='left'|'right';
export function choosePanelSide(mode:Preferences['panelSide'],current:PanelSide,leftSpace:number,rightSpace:number,panelWidth:number):PanelSide{
  if(mode!=='auto')return mode;
  const here=current==='left'?leftSpace:rightSpace,there=current==='left'?rightSpace:leftSpace;
  // Keep the current side in the middle; switch before clipping, with a dead band.
  return here<panelWidth+20&&there>panelWidth+52?(current==='left'?'right':'left'):current;
}
