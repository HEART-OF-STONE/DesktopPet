use super::*;
use serde::Serialize;
use std::collections::{BTreeMap,HashSet};

// USD / 1M tokens; Standard short-context reference prices checked 2026-09-15.
// https://developers.openai.com/api/docs/pricing
pub fn default_rates()->Vec<PriceRate>{
    [("gpt-6-astra",10.,1.,50.),("gpt-5.6-sol",4.,0.4,20.),("gpt-5.6-terra",2.,0.2,12.),("gpt-5.6-luna",0.2,0.02,1.2)]
        .into_iter().map(|(model,input,cached,output)|PriceRate{source:"codex".into(),model:model.into(),input,cached,output}).collect()
}
pub fn valid_rates(rates:&[PriceRate])->bool{
    let mut keys=HashSet::new();rates.len()<=100&&rates.iter().all(|r|
        [&r.source,&r.model].iter().all(|s|!s.is_empty()&&s.len()<=160&&s.trim()==s.as_str()&&!s.chars().any(char::is_control))
        && keys.insert((&r.source,&r.model))&&[r.input,r.cached,r.output].iter().all(|v|v.is_finite()&&(0.0..=1_000_000.0).contains(v)))
}
#[derive(Default,Serialize)]
#[serde(rename_all="camelCase")]
struct Total {usd:Option<f64>,records:u32,unpriced:u32,invalid:u32}
impl Total {
    fn add(&mut self,r:&UsageRecord,rate:Option<&PriceRate>){
        self.records+=1;
        let t=&r.tokens;
        if t.cached>t.input||t.reasoning>t.output||t.input.checked_add(t.output)!=Some(t.total){self.invalid+=1;return;}
        if let Some(p)=rate{let amount=((t.input-t.cached) as f64*p.input+t.cached as f64*p.cached+t.output as f64*p.output)/1_000_000.;self.usd=Some(self.usd.unwrap_or(0.)+amount);}else{self.unpriced+=1;}
    }
}
pub fn summarize(d:&Data,today:&str,first:&str)->Value{
    let rates=d.price_rates.iter().map(|p|((p.source.as_str(),p.model.as_str()),p)).collect::<BTreeMap<_,_>>();
    let(mut day,mut week)=(Total::default(),Total::default());let mut models=BTreeMap::<(&str,&str),Total>::new();
    for r in &d.usage{if r.day.as_str()<first||r.day.as_str()>today{continue;}let rate=rates.get(&(r.source.as_str(),r.model.as_str())).copied();week.add(r,rate);if r.day==today{day.add(r,rate);}models.entry((&r.source,&r.model)).or_default().add(r,rate);}
    json!({"today":day,"week":week,"models":models.into_iter().map(|((source,model),total)|json!({"source":source,"model":model,"total":total})).collect::<Vec<_>>(),"rates":d.price_rates,"updatedAt":d.pricing_updated_at})
}
#[tauri::command]
pub async fn update_price_rates(window:WebviewWindow,app:tauri::AppHandle,rates:Vec<PriceRate>)->Result<Value,String>{
    main_only(&window)?;if !valid_rates(&rates){return Err("价格无效：来源和模型需唯一，单价需为 0–1000000 美元 / 百万 token，最多 100 行".into());}
    tauri::async_runtime::spawn_blocking(move||{let s=app.state::<Service>();let _guard=s.refresh.lock().map_err(|_|"价格设置忙碌中")?;let mut d=s.data.lock().unwrap();let mut next=d.clone();next.price_rates=rates;next.pricing_updated_at=Some(now());persist(&s,&next)?;*d=next;let value=view(&s,&d);let _=app.emit("integrations-changed",&value);Ok(value)}).await.map_err(|_|"价格保存失败")?
}
#[cfg(test)]mod tests{
    use super::*;
    fn row(model:&str)->UsageRecord{UsageRecord{id:"test".into(),at:0,day:"2026-09-15".into(),source:"codex".into(),model:model.into(),tokens:Tokens{input:1_000_000,cached:400_000,output:100_000,reasoning:50_000,total:1_100_000}}}
    #[test]fn cache_and_reasoning_are_not_double_counted(){let mut d=Data::default();d.usage.push(row("gpt-6-astra"));let v=summarize(&d,"2026-09-15","2026-09-09");assert!((v["today"]["usd"].as_f64().unwrap()-11.4).abs()<1e-9);}
    #[test]fn unknown_invalid_and_zero_price_are_distinct(){let mut d=Data::default();d.usage.push(row("unknown"));assert!(summarize(&d,"2026-09-15","2026-09-09")["today"]["usd"].is_null());d.usage.push(row("gpt-6-astra"));d.usage[1].tokens.cached=2_000_000;let v=summarize(&d,"2026-09-15","2026-09-09");assert_eq!(v["today"]["unpriced"],1);assert_eq!(v["today"]["invalid"],1);d.price_rates.push(PriceRate{source:"codex".into(),model:"unknown".into(),input:0.,cached:0.,output:0.});assert_eq!(summarize(&d,"2026-09-15","2026-09-09")["today"]["usd"],0.);}
    #[test]fn source_and_date_scopes_and_repricing(){let mut d=Data::default();d.usage.push(row("gpt-6-astra"));let mut other=row("gpt-6-astra");other.source="other".into();d.usage.push(other);let mut old=row("gpt-6-astra");old.day="2026-09-08".into();d.usage.push(old);let v=summarize(&d,"2026-09-15","2026-09-09");assert_eq!(v["week"]["records"],2);assert_eq!(v["week"]["unpriced"],1);d.price_rates[0].output=100.;assert!((summarize(&d,"2026-09-15","2026-09-09")["today"]["usd"].as_f64().unwrap()-16.4).abs()<1e-9);}
    #[test]fn legacy_defaults_and_price_validation(){let d:Data=serde_json::from_str("{}").unwrap();assert_eq!(d.price_rates.len(),4);let mut rates=default_rates();rates.push(rates[0].clone());assert!(!valid_rates(&rates));rates.pop();rates[0].input=f64::NAN;assert!(!valid_rates(&rates));assert!(valid_rates(&[]));}
}
