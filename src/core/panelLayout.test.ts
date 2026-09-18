import { describe,it,expect } from 'vitest';
import { choosePanelSide } from './panelLayout';
describe('side panel placement',()=>{
  it('respects fixed sides',()=>{expect(choosePanelSide('left','right',0,900,224)).toBe('left');expect(choosePanelSide('right','left',900,0,224)).toBe('right');});
  it('changes sides near edges and holds in the center',()=>{expect(choosePanelSide('auto','right',600,230,224)).toBe('left');expect(choosePanelSide('auto','left',230,600,224)).toBe('right');expect(choosePanelSide('auto','left',400,400,224)).toBe('left');});
  it('avoids oscillation in constrained space and respects scaled width',()=>{expect(choosePanelSide('auto','left',230,250,224)).toBe('left');expect(choosePanelSide('auto','right',600,290,280)).toBe('left');});
});
