import {describe,expect,it} from 'vitest';
import {type Estimate,type TodayModel} from './integrations';
import {modelAmount,modelDistribution,modelName,shareLabel} from './modelDistribution';

const model=(id:string,usd:number|null,tokens=100):TodayModel=>({source:'codex',model:id,tokens:{input:tokens-20,cached:10,output:20,reasoning:10,total:tokens},total:{usd,records:1,unpriced:usd===null?1:0,invalid:0}});
const estimate=(todayModels:TodayModel[]):Estimate=>({today:{usd:null,records:0,unpriced:0,invalid:0},week:{usd:999,records:2,unpriced:0,invalid:0},models:[{source:'codex',model:'yesterday',total:{usd:999,records:2,unpriced:0,invalid:0}}],todayModels,rates:[],updatedAt:null});
describe('today model distribution',()=>{
  it('uses only today, excludes missing prices from cost but includes their tokens',()=>{
    const e=estimate([model('a',60,300),model('b',30,200),model('c',10,100),model('codex-auto-review',null,400)]);
    const cost=modelDistribution(e,'cost');expect(cost.total).toBe(100);expect(cost.rows.map(m=>m.share)).toEqual([0.6,0.3,0.1]);expect(cost.unpriced).toHaveLength(1);
    const tokens=modelDistribution(e,'tokens');expect(tokens.total).toBe(1000);expect(tokens.rows[0].name).toBe('codex-auto-review');expect(tokens.rows[0].share).toBe(0.4);
    delete e.todayModels;expect(modelDistribution(e,'cost').rows).toEqual([]);expect(modelDistribution(e,'cost').hasData).toBe(false);
  });
  it('groups beyond top three without losing value or percentage and separates sources',()=>{
    const e=estimate([model('a',5),model('b',10),model('c',20),model('d',30),model('e',35)]);
    const d=modelDistribution(e,'cost');expect(d.rows.map(m=>m.value)).toEqual([35,30,20,15]);expect(d.rows[3].members).toHaveLength(2);expect(d.rows.reduce((n,m)=>n+m.share!,0)).toBeCloseTo(1,12);
    const other={...model('gpt-6-sol',20),source:'other'};const rows=modelDistribution(estimate([other,model('gpt-6-sol',10)]),'cost').rows;expect(rows[0].key).not.toBe(rows[1].key);expect(rows[0].name).toBe('other / GPT-6 Sol');
  });
  it('keeps free, unknown and invalid distinct, and does not invent zero cost',()=>{
    const invalid=model('broken',null);invalid.total.unpriced=0;invalid.total.invalid=1;
    const d=modelDistribution(estimate([model('free',0),model('unknown',null),invalid]),'cost');expect(d.rows).toHaveLength(1);expect(d.rows[0].share).toBeNull();expect(d.rows[0].value).toBe(0);expect(d.unpriced).toHaveLength(1);expect(d.invalid).toHaveLength(1);
    expect(shareLabel(null)).toBe('—');expect(shareLabel(0.00005)).toBe('<0.1%');expect(shareLabel(0)).toBe('0%');expect(modelAmount(0)).toBe('$0.00');expect(modelAmount(0.001)).toBe('<$0.01');
  });
  it('recomputes shares after repricing and rejects non-finite values',()=>{
    const e=estimate([model('a',10),model('b',10),model('bad',NaN)]);expect(modelDistribution(e,'cost').rows[0].share).toBe(0.5);
    e.todayModels![0].total.usd=30;expect(modelDistribution(e,'cost').rows[0].share).toBe(0.75);expect(modelName(model('gpt-6.1-sol',0))).toBe('GPT-6.1 Sol');
  });
});
