import { expect,it } from 'vitest';
import { estimateLabel,emptyIntegrations } from './integrations';
import { petMetric } from './agentStatus';
it('keeps no records, unpriced and free usage distinct',()=>{
  expect(estimateLabel()).toBe('暂无记录');
  expect(estimateLabel({usd:null,records:1,unpriced:1,invalid:0})).toBe('未计价');
  expect(estimateLabel({usd:0,records:1,unpriced:0,invalid:0})).toBe('$0.00');
});
it('does not round a small positive estimate to free',()=>{
  expect(estimateLabel({usd:0.000001,records:1,unpriced:0,invalid:0})).toBe('< $0.0001');
  expect(estimateLabel({usd:1.2345,records:2,unpriced:1,invalid:0})).toBe('$1.2345 · 部分');
});
it('pet estimate identifies incomplete collection',()=>{
  expect(petMetric({...emptyIntegrations,scanPending:true,settings:{...emptyIntegrations.settings,petMetric:'estimate'}},0)).toBe('今日预估 暂无记录 · 补读中');
});
