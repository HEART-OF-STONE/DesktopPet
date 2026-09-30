import {describe,it,expect} from 'vitest';
import type {Estimate,PriceRate} from './integrations';
import {missingReferenceRates,priceOrigin} from './priceOrigins';
const rate:PriceRate={source:'codex',model:'gpt-6.1-sol',input:2,cached:.1,output:10};
const total={usd:null,records:0,unpriced:0,invalid:0};
const estimate:Estimate={today:total,week:total,models:[],rates:[rate],updatedAt:null,referenceRates:[rate],rateOrigins:[{source:rate.source,model:rate.model,kind:'reference',checkedOn:'2026-09-30'}]};
const row={...rate,input:'2.0',cached:'.1',output:'10'};
describe('price reference management',()=>{
 it('uses exact source and model keys to identify missing references',()=>{expect(missingReferenceRates(estimate)).toHaveLength(0);expect(missingReferenceRates({...estimate,rates:[{...rate,source:'other'}]})).toEqual([rate]);expect(missingReferenceRates(undefined)).toEqual([]);});
 it('distinguishes saved references, draft edits and unknown legacy metadata',()=>{expect(priceOrigin(estimate,row).label).toBe('内置参考价 · 09-30');expect(priceOrigin(estimate,{...row,input:'4'}).label).toBe('自定义 · 未保存');expect(priceOrigin(estimate,{...row,model:'new'}).kind).toBe('custom');expect(priceOrigin({...estimate,rateOrigins:undefined},row).kind).toBe('unknown');});
 it('keeps custom labels even when values match the reference',()=>{expect(priceOrigin({...estimate,rateOrigins:[{...estimate.rateOrigins![0],kind:'custom',checkedOn:null}]},row).label).toBe('自定义价格');});
});
