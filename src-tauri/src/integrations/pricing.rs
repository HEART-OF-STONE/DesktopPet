use super::*;
use serde::Serialize;
use std::collections::{BTreeMap,BTreeSet,HashSet};

const REFERENCE_VERSION:&str="2026-09-30";
fn key(r:&PriceRate)->String{serde_json::to_string(&(&r.source,&r.model)).unwrap()}
fn same_price(a:&PriceRate,b:&PriceRate)->bool{a.input==b.input&&a.cached==b.cached&&a.output==b.output}
fn checked_on(model:&str)->&'static str{match model{"gpt-6.1-sol"=>"2026-09-30","gpt-6-sol"|"gpt-6-luna"=>"2026-09-29",_=>"2026-09-15"}}
fn custom(d:&Data,r:&PriceRate)->bool{!default_rates().iter().any(|p|p.source==r.source&&p.model==r.model&&same_price(p,r))||d.pricing_custom.as_ref().is_some_and(|keys|keys.contains(&key(r)))}

// USD / 1M tokens; Standard short-context reference prices. Sol/Luna checked 2026-09-29.
// https://developers.openai.com/api/docs/pricing
// GPT-6.1 Sol checked 2026-09-30: https://developers.openai.com/api/docs/models/gpt-6.1-sol
pub fn default_rates()->Vec<PriceRate>{
    [("gpt-6-astra",10.,1.,50.),("gpt-5.6-sol",4.,0.4,20.),("gpt-5.6-terra",2.,0.2,12.),("gpt-5.6-luna",0.2,0.02,1.2),("gpt-6-sol",2.,0.2,10.),("gpt-6-luna",0.1,0.01,0.5),("gpt-6.1-sol",2.,0.1,10.)]
        .into_iter().map(|(model,input,cached,output)|PriceRate{source:"codex".into(),model:model.into(),input,cached,output}).collect()
}
// Add newly supported models once. Never replace a custom rate or restore a
// rate the user deliberately removes after this migration.
pub fn migrate(d:&mut Data)->bool{
    let origins_missing=d.pricing_custom.is_none();
    if origins_missing{d.pricing_custom=Some(d.price_rates.iter().filter(|r|custom(d,r)).map(key).collect());}
    if d.pricing_revision>=2{return origins_missing;}
    for rate in default_rates(){
        let introduced=match rate.model.as_str(){"gpt-6-sol"|"gpt-6-luna"=>1,"gpt-6.1-sol"=>2,_=>0};
        if d.pricing_revision<introduced&&d.price_rates.len()<100&&!d.price_rates.iter().any(|r|r.source==rate.source&&r.model==rate.model){d.price_rates.push(rate);}
    }
    d.pricing_revision=2;true
}
fn save_rates(d:&mut Data,rates:Vec<PriceRate>){
    let keys=rates.iter().filter(|r|custom(d,r)||!d.price_rates.iter().any(|p|p.source==r.source&&p.model==r.model&&same_price(p,r))).map(key).collect::<BTreeSet<_>>();
    d.price_rates=rates;d.pricing_custom=Some(keys);
}
fn supplement(d:&mut Data)->Result<usize,String>{
    let missing=default_rates().into_iter().filter(|r|!d.price_rates.iter().any(|p|p.source==r.source&&p.model==r.model)).collect::<Vec<_>>();
    if d.price_rates.len()+missing.len()>100{return Err("价格表空间不足，无法补齐全部参考价；请先移除不需要的价格。".into());}
    if d.pricing_custom.is_none(){d.pricing_custom=Some(d.price_rates.iter().filter(|r|custom(d,r)).map(key).collect());}
    if let Some(keys)=d.pricing_custom.as_mut(){for r in &missing{keys.remove(&key(r));}}
    let count=missing.len();d.price_rates.extend(missing);Ok(count)
}
pub fn valid_rates(rates:&[PriceRate])->bool{
    let mut keys=HashSet::new();rates.len()<=100&&rates.iter().all(|r|
        [&r.source,&r.model].iter().all(|s|!s.is_empty()&&s.len()<=160&&s.trim()==s.as_str()&&!s.chars().any(char::is_control))
        && keys.insert((&r.source,&r.model))&&[r.input,r.cached,r.output].iter().all(|v|v.is_finite()&&(0.0..=1_000_000.0).contains(v)))
}
pub fn amount(row:&UsageRecord,rates:&[PriceRate])->Option<f64>{
    let t=&row.tokens;
    if t.cached>t.input||t.reasoning>t.output||t.input.checked_add(t.output)!=Some(t.total){return None;}
    let p=rates.iter().find(|p|p.source==row.source&&p.model==row.model)?;
    Some(((t.input-t.cached) as f64*p.input+t.cached as f64*p.cached+t.output as f64*p.output)/1_000_000.)
}
#[derive(Default,Serialize)]
#[serde(rename_all="camelCase")]
struct Total {usd:Option<f64>,records:u32,unpriced:u32,invalid:u32,unpriced_tokens:u64}
impl Total {
    fn add(&mut self,r:&UsageRecord,rate:Option<&PriceRate>){
        self.records+=1;
        let t=&r.tokens;
        if t.cached>t.input||t.reasoning>t.output||t.input.checked_add(t.output)!=Some(t.total){self.invalid+=1;return;}
        if let Some(p)=rate{let amount=((t.input-t.cached) as f64*p.input+t.cached as f64*p.cached+t.output as f64*p.output)/1_000_000.;self.usd=Some(self.usd.unwrap_or(0.)+amount);}else{self.unpriced+=1;self.unpriced_tokens=self.unpriced_tokens.saturating_add(t.total);}
    }
}
#[derive(Default,Serialize)]
struct ModelDay {tokens:Tokens,total:Total}
pub fn summarize(d:&Data,today:&str,first:&str)->Value{
    let rates=d.price_rates.iter().map(|p|((p.source.as_str(),p.model.as_str()),p)).collect::<BTreeMap<_,_>>();
    let(mut day,mut week)=(Total::default(),Total::default());let mut models=BTreeMap::<(&str,&str),Total>::new();let mut today_models=BTreeMap::<(&str,&str),ModelDay>::new();
    for r in &d.usage{if r.day.as_str()<first||r.day.as_str()>today{continue;}let rate=rates.get(&(r.source.as_str(),r.model.as_str())).copied();week.add(r,rate);if r.day==today{day.add(r,rate);let m=today_models.entry((&r.source,&r.model)).or_default();m.tokens.add(&r.tokens);m.total.add(r,rate);}models.entry((&r.source,&r.model)).or_default().add(r,rate);}
    json!({"today":day,"week":week,"models":models.into_iter().map(|((source,model),total)|json!({"source":source,"model":model,"total":total})).collect::<Vec<_>>(),
        "todayModels":today_models.into_iter().map(|((source,model),m)|json!({"source":source,"model":model,"tokens":m.tokens,"total":m.total})).collect::<Vec<_>>(),"rates":d.price_rates,"updatedAt":d.pricing_updated_at,
        "referenceRates":default_rates(),"referenceVersion":REFERENCE_VERSION,"rateOrigins":d.price_rates.iter().map(|r|json!({"source":r.source,"model":r.model,"kind":if custom(d,r){"custom"}else{"reference"},"checkedOn":if custom(d,r){None}else{Some(checked_on(&r.model))}})).collect::<Vec<_>>()})
}
#[tauri::command]
pub async fn update_price_rates(window:WebviewWindow,app:tauri::AppHandle,rates:Vec<PriceRate>)->Result<Value,String>{
    main_only(&window)?;if !valid_rates(&rates){return Err("价格无效：来源和模型需唯一，单价需为 0–1000000 美元 / 百万 token，最多 100 行".into());}
    tauri::async_runtime::spawn_blocking(move||{let s=app.state::<Service>();let _guard=s.refresh.lock().map_err(|_|"价格设置忙碌中")?;let mut d=s.data.lock().unwrap();let mut next=d.clone();save_rates(&mut next,rates);next.pricing_updated_at=Some(now());persist(&s,&next)?;*d=next;let value=view(&s,&d);let _=app.emit("integrations-changed",&value);Ok(value)}).await.map_err(|_|"价格保存失败")?
}
#[tauri::command]
pub async fn supplement_price_rates(window:WebviewWindow,app:tauri::AppHandle)->Result<Value,String>{
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move||{let s=app.state::<Service>();let _guard=s.refresh.lock().map_err(|_|"价格设置忙碌中")?;let mut d=s.data.lock().map_err(|_|"价格状态不可用")?;let mut next=d.clone();
        if supplement(&mut next)?>0{next.pricing_updated_at=Some(now());persist(&s,&next)?;*d=next;}
        let value=view(&s,&d);let _=app.emit("integrations-changed",&value);Ok(value)}).await.map_err(|_|"参考价补齐失败")?
}
#[cfg(test)]mod tests{
    use super::*;
    fn row(model:&str)->UsageRecord{UsageRecord{id:"test".into(),at:0,day:"2026-09-15".into(),source:"codex".into(),model:model.into(),tokens:Tokens{input:1_000_000,cached:400_000,output:100_000,reasoning:50_000,total:1_100_000}}}
    #[test]fn today_models_preserve_scope_tokens_and_repricing(){
        let mut d=Data::default();d.usage.push(row("gpt-6-astra"));d.usage.push(row("gpt-6-astra"));d.usage.push(row("unknown"));
        let mut yesterday=row("only-yesterday");yesterday.day="2026-09-14".into();d.usage.push(yesterday);
        let mut other=row("gpt-6-astra");other.source="other".into();d.usage.push(other);
        let v=summarize(&d,"2026-09-15","2026-09-09");let models=v["todayModels"].as_array().unwrap();assert_eq!(models.len(),3);assert_eq!(v["models"].as_array().unwrap().len(),4);
        let astra=models.iter().find(|m|m["source"]=="codex"&&m["model"]=="gpt-6-astra").unwrap();assert_eq!(astra["tokens"]["total"],2_200_000);assert_eq!(astra["tokens"]["cached"],800_000);assert_eq!(astra["total"]["records"],2);
        assert!((models.iter().filter_map(|m|m["total"]["usd"].as_f64()).sum::<f64>()-v["today"]["usd"].as_f64().unwrap()).abs()<1e-9);
        let retained=d.usage.len();d.price_rates[0].output=100.;let repriced=summarize(&d,"2026-09-15","2026-09-09");assert_eq!(d.usage.len(),retained);assert_ne!(v["todayModels"][0]["total"]["usd"],repriced["todayModels"][0]["total"]["usd"]);assert_eq!(v["todayModels"][0]["tokens"],repriced["todayModels"][0]["tokens"]);
    }
    #[test]fn today_models_distinguish_missing_invalid_and_free(){
        let mut d=Data::default();d.usage.push(row("missing"));let mut bad=row("broken");bad.tokens.cached=2_000_000;d.usage.push(bad);d.usage.push(row("free"));
        d.price_rates.push(PriceRate{source:"codex".into(),model:"free".into(),input:0.,cached:0.,output:0.});
        let v=summarize(&d,"2026-09-15","2026-09-09");let models=v["todayModels"].as_array().unwrap();
        let missing=models.iter().find(|m|m["model"]=="missing").unwrap();assert!(missing["total"]["usd"].is_null());assert_eq!(missing["total"]["unpriced"],1);
        let broken=models.iter().find(|m|m["model"]=="broken").unwrap();assert!(broken["total"]["usd"].is_null());assert_eq!(broken["total"]["invalid"],1);
        assert_eq!(models.iter().find(|m|m["model"]=="free").unwrap()["total"]["usd"],0.);assert_eq!(models.iter().map(|m|m["tokens"]["total"].as_u64().unwrap()).sum::<u64>(),3_300_000);
    }
    #[test]fn legacy_origins_and_custom_edits_survive_restart(){
        let mut d=Data::default();d.pricing_revision=2;d.price_rates[0].input=12.;assert!(migrate(&mut d));assert!(custom(&d,&d.price_rates[0]));assert!(!custom(&d,&d.price_rates[1]));assert!(!migrate(&mut d));
        let mut rates=d.price_rates.clone();rates[0].input=10.;rates[1].input=0.;save_rates(&mut d,rates);
        assert!(custom(&d,&d.price_rates[0]));assert!(custom(&d,&d.price_rates[1]));assert!(!custom(&d,&d.price_rates[2]));
        let restored:Data=serde_json::from_slice(&serde_json::to_vec(&d).unwrap()).unwrap();assert!(custom(&restored,&restored.price_rates[0]));
        let mut rates=d.price_rates.clone();let r=rates.pop().unwrap();save_rates(&mut d,rates);let mut rates=d.price_rates.clone();rates.push(r);save_rates(&mut d,rates);assert!(custom(&d,d.price_rates.last().unwrap()));
    }
    #[test]fn supplementation_preserves_custom_prices_and_reprices_missing_records(){
        let mut d=Data::default();migrate(&mut d);let mut rates=d.price_rates.clone();rates[0].input=0.;rates.retain(|r|r.model!="gpt-6.1-sol");save_rates(&mut d,rates);d.usage.push(row("gpt-6.1-sol"));
        let before=summarize(&d,"2026-09-15","2026-09-09");assert_eq!(before["today"]["unpricedTokens"],1_100_000);
        assert_eq!(supplement(&mut d).unwrap(),1);assert_eq!(d.price_rates[0].input,0.);assert!(custom(&d,&d.price_rates[0]));assert!(!custom(&d,d.price_rates.last().unwrap()));
        assert_eq!(summarize(&d,"2026-09-15","2026-09-09")["today"]["usd"],2.24);assert_eq!(supplement(&mut d).unwrap(),0);
        let snapshot=serde_json::to_vec(&d).unwrap();let mut upgraded:Data=serde_json::from_slice(&snapshot).unwrap();migrate(&mut upgraded);
        let fresh=Data::default();assert_eq!(amount(&upgraded.usage[0],&upgraded.price_rates),amount(&upgraded.usage[0],&fresh.price_rates));
    }
    #[test]fn supplementation_is_atomic_when_capacity_is_insufficient(){
        let mut d=Data::default();d.price_rates.clear();for i in 0..96{d.price_rates.push(PriceRate{source:"other".into(),model:format!("custom-{i}"),input:1.,cached:1.,output:1.});}
        let before=serde_json::to_vec(&d).unwrap();assert!(supplement(&mut d).is_err());assert_eq!(serde_json::to_vec(&d).unwrap(),before);
    }
    #[test]fn cache_and_reasoning_are_not_double_counted(){let mut d=Data::default();d.usage.push(row("gpt-6-astra"));let v=summarize(&d,"2026-09-15","2026-09-09");assert!((v["today"]["usd"].as_f64().unwrap()-11.4).abs()<1e-9);}
    #[test]fn unknown_invalid_and_zero_price_are_distinct(){let mut d=Data::default();d.usage.push(row("unknown"));assert!(summarize(&d,"2026-09-15","2026-09-09")["today"]["usd"].is_null());d.usage.push(row("gpt-6-astra"));d.usage[1].tokens.cached=2_000_000;let v=summarize(&d,"2026-09-15","2026-09-09");assert_eq!(v["today"]["unpriced"],1);assert_eq!(v["today"]["invalid"],1);d.price_rates.push(PriceRate{source:"codex".into(),model:"unknown".into(),input:0.,cached:0.,output:0.});assert_eq!(summarize(&d,"2026-09-15","2026-09-09")["today"]["usd"],0.);}
    #[test]fn source_and_date_scopes_and_repricing(){let mut d=Data::default();d.usage.push(row("gpt-6-astra"));let mut other=row("gpt-6-astra");other.source="other".into();d.usage.push(other);let mut old=row("gpt-6-astra");old.day="2026-09-08".into();d.usage.push(old);let v=summarize(&d,"2026-09-15","2026-09-09");assert_eq!(v["week"]["records"],2);assert_eq!(v["week"]["unpriced"],1);d.price_rates[0].output=100.;assert!((summarize(&d,"2026-09-15","2026-09-09")["today"]["usd"].as_f64().unwrap()-16.4).abs()<1e-9);}
    #[test]fn legacy_defaults_and_price_validation(){let d:Data=serde_json::from_str("{}").unwrap();assert_eq!(d.price_rates.len(),7);let mut rates=default_rates();rates.push(rates[0].clone());assert!(!valid_rates(&rates));rates.pop();rates[0].input=f64::NAN;assert!(!valid_rates(&rates));assert!(valid_rates(&[]));}
    #[test]fn migration_prices_old_usage_without_overwriting_custom_prices(){
        let mut d=Data::default();d.price_rates.truncate(4);d.usage.push(row("gpt-6-luna"));
        assert!(summarize(&d,"2026-09-15","2026-09-09")["today"]["usd"].is_null());
        assert!(migrate(&mut d));assert_eq!(d.price_rates.len(),7);assert!((summarize(&d,"2026-09-15","2026-09-09")["today"]["usd"].as_f64().unwrap()-0.114).abs()<1e-9);
        d.price_rates.retain(|r|r.model!="gpt-6-luna");assert!(!migrate(&mut d));assert_eq!(d.price_rates.len(),6);
        let mut d=Data::default();d.price_rates[5].input=8.;migrate(&mut d);assert_eq!(d.price_rates[5].input,8.);
        let restored:Data=serde_json::from_slice(&serde_json::to_vec(&d).unwrap()).unwrap();assert_eq!(restored.pricing_revision,2);
    }
    #[test]fn revision_one_adds_sol61_and_reprices_retained_usage(){
        let mut d=Data::default();d.pricing_revision=1;d.price_rates.retain(|r|!matches!(r.model.as_str(),"gpt-6.1-sol"|"gpt-6-luna"));d.usage.push(row("gpt-6.1-sol"));
        assert!(summarize(&d,"2026-09-15","2026-09-09")["today"]["usd"].is_null());
        assert!(migrate(&mut d));assert_eq!(d.pricing_revision,2);assert!(!d.price_rates.iter().any(|r|r.model=="gpt-6-luna"));
        let v=summarize(&d,"2026-09-15","2026-09-09");assert_eq!(v["today"]["usd"],2.24);assert_eq!(v["week"]["unpriced"],0);assert_eq!(amount(&d.usage[0],&d.price_rates),Some(2.24));
        assert_eq!(amount(&row("gpt-6-sol"),&d.price_rates),Some(2.28));
        d.price_rates.retain(|r|r.model!="gpt-6.1-sol");
        let mut restored:Data=serde_json::from_slice(&serde_json::to_vec(&d).unwrap()).unwrap();assert!(!migrate(&mut restored));assert_eq!(amount(&restored.usage[0],&restored.price_rates),None);
    }
    #[test]fn sol61_migration_preserves_custom_and_free_rates(){
        for revision in [0,1]{for input in [0.,8.]{
            let mut d=Data::default();d.pricing_revision=revision;
            let p=d.price_rates.iter_mut().find(|r|r.model=="gpt-6.1-sol").unwrap();p.input=input;p.cached=0.;p.output=0.;d.pricing_updated_at=Some(42);
            assert!(migrate(&mut d));assert_eq!(d.price_rates.len(),7);assert_eq!(amount(&row("gpt-6.1-sol"),&d.price_rates),Some(0.6*input));assert_eq!(d.pricing_updated_at,Some(42));
        }}
    }
    #[test]fn price_migration_respects_capacity_and_exact_model_and_source(){
        let mut d=Data::default();d.pricing_revision=1;d.price_rates.retain(|r|r.model!="gpt-6.1-sol");
        let mut alias=row("gpt-6.1-sol-latest");assert_eq!(amount(&alias,&d.price_rates),None);
        assert!(migrate(&mut d));assert_eq!(amount(&alias,&d.price_rates),None);alias.model="gpt-6.1-sol".into();alias.source="other".into();assert_eq!(amount(&alias,&d.price_rates),None);
        d.pricing_revision=1;d.price_rates.retain(|r|r.model!="gpt-6.1-sol");
        for i in d.price_rates.len()..100{d.price_rates.push(PriceRate{source:"other".into(),model:format!("custom-{i}"),input:1.,cached:1.,output:1.});}
        assert!(migrate(&mut d));assert_eq!(d.price_rates.len(),100);assert!(valid_rates(&d.price_rates));
    }
    #[test]fn internal_models_stay_unknown_and_today_does_not_borrow_week_cost(){
        let mut d=Data::default();d.usage.push(row("codex-auto-review"));let mut old=row("gpt-6-astra");old.day="2026-09-14".into();d.usage.push(old);
        let v=summarize(&d,"2026-09-15","2026-09-09");assert!(v["today"]["usd"].is_null());assert_eq!(v["today"]["unpriced"],1);assert!(v["week"]["usd"].as_f64().unwrap()>0.);
    }
}
