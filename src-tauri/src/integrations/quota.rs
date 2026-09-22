use std::{io::{BufRead,BufReader,Write},path::PathBuf,process::{Command,Stdio},sync::mpsc,time::Duration};
use serde_json::{json,Value};
use super::models::*;

pub fn parse_quota(value:&Value, at:u64, source:&str)->Quota {
    let mut root=if value.get("rateLimitsByLimitId").is_some_and(Value::is_object) { value["rateLimitsByLimitId"].clone() }
        else { let single=value.get("rateLimits").unwrap_or(value);json!({single["limit_id"].as_str().or(single["limitId"].as_str()).unwrap_or("codex"):single}) };
    if let (Some(buckets),Some(single))=(root.as_object_mut(),value.get("rateLimits").filter(|v|v.is_object())) {
        let id=single["limitId"].as_str().or(single["limit_id"].as_str()).unwrap_or("codex");
        let entry=buckets.entry(id.to_string()).or_insert_with(||single.clone());
        if let (Some(target),Some(credits))=(entry.as_object_mut(),single.get("credits")) {target.entry("credits").or_insert_with(||credits.clone());}
    }
    let mut windows=vec![];let mut bucket_updated_at=std::collections::BTreeMap::new();let mut credits=std::collections::BTreeMap::new();
    if let Some(buckets)=root.as_object() { for (bucket,data) in buckets {
        if !data.is_object() { continue; }
        let bucket:String=bucket.chars().take(100).collect();
        if let Some(value)=data.get("credits") {
            let balance=value["balance"].as_f64().or_else(||value["balance"].as_str().filter(|s|s.len()<=100).and_then(|s|s.trim().parse::<f64>().ok())).filter(|n|n.is_finite());
            credits.insert(bucket.clone(),QuotaCredits{balance,has_credits:value["hasCredits"].as_bool().or(value["has_credits"].as_bool()),unlimited:value["unlimited"].as_bool(),updated_at:at,source:source.into()});
        }
        if !(data.get("primary").is_some() || data.get("secondary").is_some()) { continue; }
        bucket_updated_at.insert(bucket.clone(),at);
        for name in ["primary","secondary"] {
        let window=&data[name];
        let used=window["usedPercent"].as_f64().or(window["used_percent"].as_f64());
        let minutes=window["windowDurationMins"].as_u64().or(window["window_minutes"].as_u64()).or(window["window_duration_mins"].as_u64());
        if let (Some(used),Some(minutes))=(used,minutes) { if used.is_finite()&&minutes>0 { windows.push(QuotaWindow { bucket:bucket.clone(),label:name.into(),used_percent:used.clamp(0.,100.),window_minutes:minutes,
            resets_at:window["resetsAt"].as_u64().or(window["resets_at"].as_u64()).map(|s|s.saturating_mul(1000)),
            limit_name:data["limitName"].as_str().or(data["limit_name"].as_str()).map(|s|s.chars().take(100).collect()),updated_at:Some(at),source:source.into() }); } }
    } } }
    Quota { windows,credits,updated_at:Some(at),source:source.into(),error:None,bucket_updated_at }
}
pub fn merge_credits(current:&mut Quota,incoming:&Quota) {
    for (bucket,credits) in &incoming.credits {
        if current.credits.get(bucket).is_none_or(|old|credits.updated_at>=old.updated_at) {current.credits.insert(bucket.clone(),credits.clone());}
    }
}
// A log event describes one limit bucket, not the entire account. Replace that
// bucket's snapshot, including null windows, without erasing other buckets.
pub fn merge_log(current:&mut Quota,incoming:Quota) {
    merge_credits(current,&incoming);
    for w in &mut current.windows {
        if w.updated_at.is_none() {w.updated_at=current.updated_at;}
        if w.source.is_empty() {w.source=current.source.clone();}
        current.bucket_updated_at.entry(w.bucket.clone()).or_insert(w.updated_at.unwrap_or(0));
    }
    for (bucket,at) in &incoming.bucket_updated_at {
        if *at<current.bucket_updated_at.get(bucket).copied().unwrap_or(0) {continue;}
        current.windows.retain(|w|&w.bucket!=bucket);
        current.windows.extend(incoming.windows.iter().filter(|w|&w.bucket==bucket).cloned());
        current.bucket_updated_at.insert(bucket.clone(),*at);
        if *at>=current.updated_at.unwrap_or(0) {current.updated_at=Some(*at);current.source=incoming.source.clone();}
    }
}
pub fn executable(configured:&str)->PathBuf {
    if !configured.trim().is_empty() { return PathBuf::from(configured.trim()); }
    if let Some(local)=std::env::var_os("LOCALAPPDATA") { let dir=PathBuf::from(local).join("OpenAI/Codex/bin");
        if let Ok(entries)=std::fs::read_dir(dir) { let mut files=entries.filter_map(Result::ok).map(|e|e.path().join("codex.exe")).filter(|p|p.is_file()).collect::<Vec<_>>();
            files.sort_by_key(|p|std::fs::metadata(p).and_then(|m|m.modified()).ok()); if let Some(path)=files.pop() { return path; }
        }
    } PathBuf::from("codex.exe")
}
pub fn query(settings:&Settings)->Result<Quota,String> {
    let mut command=Command::new(executable(&settings.codex_executable));
    command.args(["app-server","--stdio"]).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    if !settings.codex_home.is_empty() { command.env("CODEX_HOME",&settings.codex_home); }
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    let mut child=command.spawn().map_err(|_|"无法启动 Codex，请在连接设置中指定 codex.exe")?;
    let stdout=child.stdout.take().unwrap();let mut stdin=child.stdin.take().unwrap();
    let (sender,receiver)=mpsc::channel();
    std::thread::spawn(move || { for line in BufReader::new(stdout).lines() { let Ok(line)=line else {break};if line.len()>2*1024*1024 {continue;}if let Ok(value)=serde_json::from_str::<Value>(&line) { if sender.send(value).is_err(){break;} } } });
    let result=(|| {
        let send=|writer:&mut std::process::ChildStdin,value:Value|writeln!(writer,"{value}").map_err(|_|"Codex 连接已关闭".to_string());
        send(&mut stdin,json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"desktop_pet","title":"DesktopPet","version":env!("CARGO_PKG_VERSION")}}}))?;
        let deadline=std::time::Instant::now()+Duration::from_secs(15);
        loop { let remaining=deadline.saturating_duration_since(std::time::Instant::now());
            let value=receiver.recv_timeout(remaining).map_err(|_|"Codex 查询超时，请稍后重试".to_string())?;
            if value["id"]==1 { if value.get("error").is_some() { return Err("当前 Codex 版本无法初始化查询接口".into()); }
                send(&mut stdin,json!({"method":"initialized"}))?; send(&mut stdin,json!({"id":2,"method":"account/rateLimits/read"}))?;
            }
            if value["id"]==2 { if value.get("error").is_some() { return Err("实时额度暂不可用：Codex CLI 需要已登录的订阅账户；桌面版登录态可能未共享。继续显示最近日志快照。".into()); }
                let quota=parse_quota(&value["result"],super::now(),"app_server"); if quota.bucket_updated_at.is_empty()&&quota.credits.is_empty() {return Err("该账户未返回额度或积分余额数据".into());}return Ok(quota);
            }
        }
    })();
    let _=child.kill();let _=child.wait(); result
}
#[cfg(test)] mod tests { use super::*;
    #[test] fn credits_parse_strings_numbers_unknown_and_unlimited_without_currency_conversion() {
        for balance in [json!(1234.5),json!("1234.5")] {
            let q=parse_quota(&json!({"rateLimitsByLimitId":{"codex":{"credits":{"balance":balance,"hasCredits":true,"unlimited":false}}},"rateLimitResetCredits":{"availableCount":9}}),100,"app_server");
            let c=&q.credits["codex"];assert_eq!(c.balance,Some(1234.5));assert_eq!(c.has_credits,Some(true));assert_eq!(c.updated_at,100);assert!(q.windows.is_empty());
        }
        for balance in [Value::Null,json!(""),json!("bad"),json!("NaN"),json!("inf")] {
            let q=parse_quota(&json!({"limit_id":"codex","credits":{"balance":balance,"has_credits":false}}),100,"local_log");
            assert_eq!(q.credits["codex"].balance,None);assert_eq!(q.credits["codex"].has_credits,Some(false));
        }
        let q=parse_quota(&json!({"credits":{"balance":"0","unlimited":true}}),100,"local_log");
        assert_eq!(q.credits["codex"].balance,Some(0.));assert_eq!(q.credits["codex"].unlimited,Some(true));
    }
    #[test] fn credits_merge_independently_and_explicit_null_clears_only_its_bucket() {
        let snapshot=|at,value|parse_quota(&json!({"limit_id":"codex","credits":value}),at,"local_log");
        let mut q=snapshot(100,json!({"balance":"50"}));
        merge_log(&mut q,bucket("codex",200,10080,false));assert_eq!(q.credits["codex"].updated_at,100);
        merge_log(&mut q,parse_quota(&json!({"limit_id":"other","credits":{"balance":"999"}}),300,"local_log"));
        merge_log(&mut q,snapshot(90,json!({"balance":"70"})));assert_eq!(q.credits["codex"].balance,Some(50.));
        merge_log(&mut q,snapshot(400,Value::Null));assert_eq!(q.credits["codex"].balance,None);
        merge_log(&mut q,snapshot(300,json!({"balance":"70"})));assert_eq!(q.credits["codex"].balance,None);
        assert_eq!(q.credits["other"].balance,Some(999.));
        let restored:Quota=serde_json::from_str(&serde_json::to_string(&q).unwrap()).unwrap();assert_eq!(restored.credits["codex"].updated_at,400);
        let legacy:Quota=serde_json::from_value(json!({"windows":[]})).unwrap();assert!(legacy.credits.is_empty());
    }
    #[test] fn legacy_credits_fill_only_an_omitted_map_field() {
        let mut v=json!({"rateLimits":{"limitId":"codex","credits":{"balance":"12"}},"rateLimitsByLimitId":{"codex":{"primary":null}}});
        assert_eq!(parse_quota(&v,1,"app_server").credits["codex"].balance,Some(12.));
        v["rateLimitsByLimitId"]["codex"]["credits"]=Value::Null;
        assert_eq!(parse_quota(&v,2,"app_server").credits["codex"].balance,None);
    }
    fn bucket(id:&str,at:u64,primary:u64,secondary:bool)->Quota {parse_quota(&json!({"limit_id":id,"primary":{"used_percent":20,"window_minutes":primary},"secondary":if secondary {json!({"used_percent":35,"window_minutes":10080})}else{Value::Null}}),at,"local_log")}
    #[test] fn plus_windows_survive_interleaved_spark_and_older_logs() {
        let mut q=bucket("codex",100,300,true);
        merge_log(&mut q,bucket("codex_bengalfox",200,300,true));
        assert_eq!(q.windows.len(),4);
        merge_log(&mut q,bucket("codex",150,300,true));
        assert_eq!(q.windows.iter().filter(|w|w.bucket=="codex").count(),2);
        assert!(q.windows.iter().filter(|w|w.bucket=="codex").all(|w|w.updated_at==Some(150)));
        assert!(q.windows.iter().filter(|w|w.bucket=="codex_bengalfox").all(|w|w.updated_at==Some(200)));
        merge_log(&mut q,bucket("codex",120,10080,false));
        assert_eq!(q.windows.len(),4);
        // The same bucket's new snapshot removes obsolete/null windows.
        merge_log(&mut q,bucket("codex",250,10080,false));
        assert_eq!(q.windows.len(),3);
        assert_eq!(q.windows.iter().find(|w|w.bucket=="codex").unwrap().window_minutes,10080);
    }
    #[test] fn null_bucket_clears_windows_without_resurrecting_old_data() {
        let mut q=bucket("codex",100,300,true);
        merge_log(&mut q,parse_quota(&json!({"limit_id":"codex","primary":null,"secondary":null}),200,"local_log"));
        assert!(q.windows.is_empty());
        merge_log(&mut q,bucket("codex",150,300,true));assert!(q.windows.is_empty());
        let restored:Quota=serde_json::from_str(&serde_json::to_string(&q).unwrap()).unwrap();assert_eq!(restored.bucket_updated_at["codex"],200);
    }
    #[test] fn legacy_snapshot_migrates_and_map_keeps_legacy_main_bucket() {
        let mut q:Quota=serde_json::from_value(json!({"windows":[{"bucket":"codex","label":"primary","usedPercent":34,"windowMinutes":10080,"resetsAt":null}],"updatedAt":100,"source":"app_server"})).unwrap();
        merge_log(&mut q,bucket("codex_bengalfox",200,300,true));
        let main=q.windows.iter().find(|w|w.bucket=="codex").unwrap();assert_eq!(main.updated_at,Some(100));assert_eq!(main.source,"app_server");
        let both=parse_quota(&json!({"rateLimits":{"limitId":"codex","primary":{"usedPercent":34,"windowDurationMins":10080}},"rateLimitsByLimitId":{"codex_bengalfox":{"limitName":"GPT-5.3-Codex-Spark","primary":{"usedPercent":0,"windowDurationMins":300}}}}),300,"app_server");
        assert_eq!(both.windows.len(),2);assert_eq!(both.windows.iter().find(|w|w.bucket=="codex_bengalfox").unwrap().limit_name.as_deref(),Some("GPT-5.3-Codex-Spark"));
    }
    #[test] fn parses_multi_bucket_and_null_windows_without_inventing_zero() { let q=parse_quota(&json!({"rateLimitsByLimitId":{"codex":{"primary":{"usedPercent":12,"windowDurationMins":300,"resetsAt":100}},"other":{"primary":null,"secondary":{"usedPercent":40,"windowDurationMins":10080}}}}),1000,"app_server");assert_eq!(q.windows.len(),2);assert_eq!(q.windows[0].resets_at,Some(100000));assert!(parse_quota(&json!({"primary":null}),1000,"local_log").windows.is_empty()); }
}
