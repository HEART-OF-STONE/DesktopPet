//! Bounded, local-only weekly quota observations. Historical percentages are
//! never synthesized from token counts, and estimate samples never cross resets.
use super::*;
use std::collections::{BTreeMap,BTreeSet};
use chrono::{DateTime,Days,Local};
use serde::{Deserialize,Serialize};

#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase")]
pub struct Observation {pub at:u64,pub used_percent:f64,pub resets_at:Option<u64>,pub source:String}
#[derive(Clone,Default,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",default)]
pub struct History {
    pub daily:BTreeMap<String,Observation>,pub points:BTreeMap<u64,Observation>,
    pub started_at:u64,pub usage_floor:u64,
    pub backfill_files:BTreeSet<String>,pub backfill_done:bool,pub backfill_total:usize,pub backfill_error:Option<String>,
}
fn first_day(at:u64)->String{
    let date=DateTime::from_timestamp_millis(at as i64).unwrap_or_default().with_timezone(&Local).date_naive();
    date.checked_sub_days(Days::new(29)).unwrap_or(date).to_string()
}
fn valid(p:&Observation,at:u64)->bool{p.at>0&&p.at<=at&&p.used_percent.is_finite()&&(0.0..=100.0).contains(&p.used_percent)&&p.resets_at.is_none_or(|r|r>p.at)}
pub fn insert(h:&mut History,p:Observation,at:u64){
    if !valid(&p,at){return;}let day=scanner::day(p.at);if day<first_day(at){return;}
    if h.daily.get(&day).is_none_or(|old|old.at<p.at){h.daily.insert(day,p.clone());}
    // Five-minute buckets bound disk size while retaining each day's exact last observation.
    let slot=p.at/300_000;
    if h.points.get(&slot).is_none_or(|old|old.at<p.at){h.points.insert(slot,p);}
}
pub fn observe(h:&mut History,q:&Quota,at:u64){
    for w in q.windows.iter().filter(|w|w.bucket=="codex"&&w.window_minutes==10080){
        if let Some(time)=w.updated_at.or(q.updated_at){insert(h,Observation{at:time,used_percent:w.used_percent,resets_at:w.resets_at,source:if w.source.is_empty(){q.source.clone()}else{w.source.clone()}},at);}
    }
}
pub fn prune(h:&mut History,at:u64){
    let first=first_day(at);h.daily.retain(|day,p|*day>=first&&*day==scanner::day(p.at)&&valid(p,at));
    h.points.retain(|_,p|scanner::day(p.at)>=first&&valid(p,at));
    while h.points.len()>8641 {h.points.pop_first();}
}

// One-time tail-only import: at most 128 recent files, 256 KiB per file,
// eight files / 100 ms per refresh. Never replay usage or reset its cursors.
pub fn backfill(h:&mut History,root:&std::path::Path,at:u64)->Result<(),String>{
    if h.backfill_done{return Ok(());}
    use std::io::{BufReader,Read,Seek,SeekFrom};
    let mut paths=vec![];scanner::list_files(&root.join("sessions"),&mut paths,0)?;scanner::list_files(&root.join("archived_sessions"),&mut paths,0)?;
    let first=first_day(at);
    let mut files=paths.into_iter().filter_map(|p|{let time=p.metadata().ok()?.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as u64;(scanner::day(time)>=first).then_some((time,p))}).collect::<Vec<_>>();
    files.sort_by_key(|(time,_)|std::cmp::Reverse(*time));files.truncate(128);h.backfill_total=files.len();
    let deadline=std::time::Instant::now()+Duration::from_millis(100);let mut count=0;
    for (_,path) in &files{
        let key=path.strip_prefix(root).unwrap_or(path).to_string_lossy().into_owned();if h.backfill_files.contains(&key){continue;}
        if count>=8||std::time::Instant::now()>=deadline{break;}count+=1;
        let mut file=fs::File::open(path).map_err(|_|"无法读取额度历史文件")?;
        let length=file.metadata().map_err(|_|"无法读取额度历史信息")?.len();let start=length.saturating_sub(256*1024);
        file.seek(SeekFrom::Start(start)).map_err(|_|"无法定位额度历史")?;let mut reader=BufReader::new(file.take(length-start));
        if start>0{scanner::bounded_line(&mut reader).map_err(|_|"无法读取额度历史")?;}
        loop{let(line,_,complete)=scanner::bounded_line(&mut reader).map_err(|_|"无法读取额度历史")?;if !complete{break;}
            // Deserialize only metadata and rate limits, never conversation bodies.
            #[derive(Deserialize)]struct Event{timestamp:Option<String>,#[serde(rename="type")]kind:String,payload:Payload}
            #[derive(Deserialize)]struct Payload{#[serde(rename="type")]kind:Option<String>,rate_limits:Option<Value>}
            if let Ok(v)=serde_json::from_slice::<Event>(&line){if v.kind=="event_msg"&&v.payload.kind.as_deref()==Some("token_count"){
                if let (Some(t),Some(limits))=(v.timestamp.as_deref().and_then(|s|DateTime::parse_from_rfc3339(s).ok()).and_then(|d|u64::try_from(d.timestamp_millis()).ok()),v.payload.rate_limits){observe(h,&quota::parse_quota(&limits,t,"local_log"),at);}
            }}
        }h.backfill_files.insert(key);
    }
    h.backfill_done=files.iter().all(|(_,p)|h.backfill_files.contains(&p.strip_prefix(root).unwrap_or(p).to_string_lossy().into_owned()));
    h.backfill_error=None;Ok(())
}

pub fn summary(d:&Data,at:u64)->Value{
    let h=&d.quota_history;let today=DateTime::from_timestamp_millis(at as i64).unwrap_or_default().with_timezone(&Local).date_naive();
    let days=(0..30).map(|ago|{let date=today.checked_sub_days(Days::new(ago)).unwrap_or(today).to_string();let p=h.daily.get(&date);json!({"day":date,"remaining":p.map(|p|100.-p.used_percent),"observedAt":p.map(|p|p.at),"resetsAt":p.and_then(|p|p.resets_at),"source":p.map(|p|p.source.as_str())})}).collect::<Vec<_>>();
    json!({"days":days,"estimate":estimate(d,at),"backfill":{"done":h.backfill_done,"completed":h.backfill_files.len(),"total":h.backfill_total,"error":h.backfill_error}})
}
fn estimate(d:&Data,at:u64)->Value{
    let h=&d.quota_history;let mut dollars=0.;let mut drop=0.;let mut samples=0;let mut excluded=0;
    let mut ratios=vec![];let mut from=None;let mut to=None;
    let latest=h.points.values().next_back();
    let mut reason=if !d.settings.codex_enabled{"额度采集已暂停"}else if d.scan_pending||d.scan_error.is_some(){"等待近期用量补齐"}else{"正在积累有效样本"};
    let current=d.quota.windows.iter().find(|w|w.bucket=="codex"&&w.window_minutes==10080);
    let matching_current=current.zip(latest).is_some_and(|(w,p)|w.resets_at==p.resets_at&&w.updated_at.or(d.quota.updated_at).is_some_and(|t|at.saturating_sub(t)<=3600000));
    let ready=d.settings.codex_enabled&&!d.scan_pending&&d.scan_error.is_none()&&matching_current;
    if d.settings.codex_enabled&&!matching_current{reason="等待当前周期的主额度快照";}
    // Prefix totals make interval queries logarithmic even on a busy 20k-row ledger.
    let mut usage=d.usage.iter().filter(|r|r.source=="codex").collect::<Vec<_>>();usage.sort_by_key(|r|r.at);
    let mut costs=vec![0.];let mut invalid=vec![0u32];
    for r in &usage{let amount=pricing::amount(r,&d.price_rates);costs.push(costs.last().unwrap()+amount.unwrap_or(0.));invalid.push(invalid.last().unwrap()+u32::from(amount.is_none()));}
    if let Some(latest)=latest.filter(|p|p.resets_at.is_some_and(|r|r>at)){
        if at.saturating_sub(latest.at)>3600000{reason="等待更新的周额度快照";}
        else if ready{
            let points=h.points.values().filter(|p|p.at>=h.started_at.max(h.usage_floor)&&p.resets_at==latest.resets_at).collect::<Vec<_>>();
            if let Some(first)=points.first(){let mut anchor=*first;let mut previous=*first;
                for p in points.iter().skip(1).copied(){
                    if p.at.saturating_sub(previous.at)>2*3600000||p.used_percent<previous.used_percent||p.at.saturating_sub(anchor.at)>24*3600000{anchor=p;previous=p;excluded+=1;continue;}
                    previous=p;let delta=p.used_percent-anchor.used_percent;
                    if delta<2.||p.at.saturating_sub(anchor.at)<300000{continue;}
                    let begin=usage.partition_point(|r|r.at<=anchor.at);let end=usage.partition_point(|r|r.at<=p.at);
                    let cost=costs[end]-costs[begin];let complete=end>begin&&invalid[end]==invalid[begin];
                    if complete&&cost>0.{dollars+=cost;drop+=delta;samples+=1;ratios.push(cost/delta*100.);from=from.or(Some(anchor.at));to=Some(p.at);}else{excluded+=1;}
                    anchor=p;
                }
            }
        }
    }else{reason="等待含重置时间的周额度快照";}
    let consistent=ratios.iter().copied().reduce(f64::max).zip(ratios.iter().copied().reduce(f64::min)).is_none_or(|(max,min)|max<=min*4.);
    let enough=samples>=3&&drop>=6.&&consistent;
    if samples>0&&!enough {reason=if consistent{"样本不足：至少 3 段、累计下降 6 个百分点"}else{"样本差异较大，暂不外推"};}
    if excluded>0&&samples==0&&ready{reason="暂无可用样本：可能缺价、记录中断或额度回升";}
    let total=if enough {Some(dollars/drop*100.)}else{None};
    json!({"totalUsd":total,"remainingUsd":total.zip(latest).map(|(v,p)|v*(100.-p.used_percent)/100.),"sampleCount":samples,"dropPercent":drop,"sampleUsd":dollars,"excluded":excluded,"from":from,"to":to,"reason":if enough{""}else{reason}})
}

#[cfg(test)]mod tests{
    use super::*;
    fn point(at:u64,used:f64,reset:u64)->Observation{Observation{at,used_percent:used,resets_at:Some(reset),source:"local_log".into()}}
    fn ledger()->(Data,u64){
        let at=1_790_000_000_000;let reset=at+86400000;let mut d=Data::default();d.quota_history.started_at=at-3600000;
        for i in 0..=3{let t=at-(3-i)*600000;insert(&mut d.quota_history,point(t,10.+i as f64*2.,reset),at);
            if i>0{d.usage.push(UsageRecord{id:i.to_string(),at:t,day:scanner::day(t),source:"codex".into(),model:"gpt-6-sol".into(),tokens:Tokens{input:1000000,total:1000000,..Default::default()}});}
        }d.quota=quota::parse_quota(&json!({"limit_id":"codex","primary":{"used_percent":16,"window_minutes":10080,"resets_at":reset/1000}}),at,"local_log");(d,at)
    }
    #[test]fn daily_last_observation_is_order_independent_and_missing_days_stay_null(){
        let (mut d,at)=ledger();let p=point(at-1000,99.,at+86400000);insert(&mut d.quota_history,p,at);
        let s=summary(&d,at);assert_eq!(s["days"].as_array().unwrap().len(),30);assert_eq!(s["days"][0]["remaining"],84.);assert_eq!(s["days"][0]["observedAt"],at);assert!(s["days"][1]["remaining"].is_null());
        insert(&mut d.quota_history,point(at+1,2.,at+86400000),at);assert_eq!(d.quota_history.daily[&scanner::day(at)].at,at);
        insert(&mut d.quota_history,point(at-40*86400000,2.,at),at);assert_eq!(d.quota_history.daily.len(),1);
        let restored:Data=serde_json::from_slice(&serde_json::to_vec(&d).unwrap()).unwrap();assert_eq!(summary(&restored,at),s);
    }
    #[test]fn estimates_same_cycle_with_complete_prices_and_reprices(){
        let(mut d,at)=ledger();let e=estimate(&d,at);assert_eq!(e["totalUsd"],100.);assert_eq!(e["remainingUsd"],84.);assert_eq!(e["sampleCount"],3);
        d.price_rates.iter_mut().find(|p|p.model=="gpt-6-sol").unwrap().input=4.;assert_eq!(estimate(&d,at)["totalUsd"],200.);
        d.usage[0].source="other".into();assert!(estimate(&d,at)["totalUsd"].is_null());
    }
    #[test]fn incomplete_stale_reset_and_pruned_intervals_do_not_produce_estimates(){
        let(d,at)=ledger();
        let mut v=d.clone();v.usage[1].model="codex-auto-review".into();assert!(estimate(&v,at)["totalUsd"].is_null());
        let mut v=d.clone();v.usage[1].tokens.cached=2000000;assert!(estimate(&v,at)["totalUsd"].is_null());
        let mut v=d.clone();v.quota_history.usage_floor=at-600000;assert!(estimate(&v,at)["totalUsd"].is_null());
        let mut v=d.clone();v.scan_pending=true;assert!(estimate(&v,at)["totalUsd"].is_null());
        let mut v=d.clone();v.settings.codex_enabled=false;assert!(estimate(&v,at)["totalUsd"].is_null());
        let mut v=d.clone();v.quota.windows.clear();assert!(estimate(&v,at)["totalUsd"].is_null());
        let mut v=d.clone();v.quota_history.points.values_mut().nth(1).unwrap().resets_at=Some(at+90000000);assert!(estimate(&v,at)["totalUsd"].is_null());
        let mut v=d.clone();v.quota_history.points.values_mut().nth(1).unwrap().used_percent=1.;assert!(estimate(&v,at)["totalUsd"].is_null());
        assert!(estimate(&d,at+3600001)["totalUsd"].is_null());assert!(estimate(&d,at+86400001)["totalUsd"].is_null());
    }
    #[test]fn only_weekly_main_quota_is_recorded_and_reset_observations_are_not_reused(){
        let(mut d,at)=ledger();d.quota_history=History::default();
        let q=quota::parse_quota(&json!({"limit_id":"codex_bengalfox","primary":{"used_percent":40,"window_minutes":10080}}),at,"local_log");observe(&mut d.quota_history,&q,at);assert!(d.quota_history.daily.is_empty());
        let q=quota::parse_quota(&json!({"limit_id":"codex","primary":{"used_percent":40,"window_minutes":300}}),at,"app_server");observe(&mut d.quota_history,&q,at);assert!(d.quota_history.daily.is_empty());
        insert(&mut d.quota_history,point(at,60.,at),at);assert!(d.quota_history.daily.is_empty());
    }
    #[test]fn old_imports_gaps_and_inconsistent_samples_cannot_create_a_total(){
        let(d,at)=ledger();let mut v=d.clone();v.quota_history.started_at=at;assert!(estimate(&v,at)["totalUsd"].is_null());
        let mut v=d.clone();v.usage[2].tokens.input=100000000;v.usage[2].tokens.total=100000000;assert_eq!(estimate(&v,at)["reason"],"样本差异较大，暂不外推");
        let mut v=d.clone();let earliest=v.quota_history.points.pop_first().unwrap().1;insert(&mut v.quota_history,point(earliest.at-3*3600000,8.,at+86400000),at);v.quota_history.started_at=at-86400000;
        assert!(estimate(&v,at)["totalUsd"].is_null());
        let mut v=d.clone();prune(&mut v.quota_history,at+31*86400000);assert!(v.quota_history.points.is_empty());assert!(v.quota_history.daily.is_empty());
    }
    #[test]fn tail_import_is_bounded_idempotent_and_never_replays_usage(){
        let root=std::env::temp_dir().join(format!("desktop-pet-quota-history-{}",uuid::Uuid::new_v4()));fs::create_dir_all(root.join("sessions")).unwrap();
        let at=now()-1000;let timestamp=DateTime::from_timestamp_millis(at as i64).unwrap().to_rfc3339();
        let event=json!({"timestamp":timestamp,"type":"event_msg","payload":{"type":"token_count","rate_limits":{"limit_id":"codex","primary":{"used_percent":27,"window_minutes":10080}}}});
        for i in 0..10{fs::write(root.join(format!("sessions/rollout-{i}.jsonl")),format!("{event}\n")).unwrap();}
        let mut h=History::default();backfill(&mut h,&root,now()).unwrap();assert!(h.backfill_files.len()<=8);assert!(!h.backfill_done);
        for _ in 0..20{backfill(&mut h,&root,now()).unwrap();if h.backfill_done{break;}}
        assert!(h.backfill_done);assert_eq!(h.backfill_files.len(),10);assert_eq!(h.daily.len(),1);assert_eq!(h.daily[&scanner::day(at)].used_percent,27.);
        let old=h.clone();backfill(&mut h,&root,now()).unwrap();assert!(h==old);fs::remove_dir_all(root).unwrap();
    }
}
