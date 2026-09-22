use std::{collections::HashSet, fs::{self,File}, io::{BufRead,BufReader,Read,Seek,SeekFrom}, path::{Path,PathBuf}};
use chrono::{DateTime,Local};
use serde::Deserialize;
use serde_json::Value;
use super::{models::*, quota::parse_quota};

#[derive(Deserialize)]
struct Envelope { #[serde(rename="type")] kind:String }

pub fn day(at:u64)->String { DateTime::from_timestamp_millis(at as i64).unwrap_or_default().with_timezone(&Local).format("%Y-%m-%d").to_string() }
pub fn tokens(value:&Value)->Tokens {
    let get=|name:&str|value[name].as_u64().unwrap_or(0).min(1_000_000_000_000);
    let input=get("input_tokens"); let output=get("output_tokens");
    Tokens { input,cached:get("cached_input_tokens"),output,reasoning:get("reasoning_output_tokens"),total:value["total_tokens"].as_u64().unwrap_or(input.saturating_add(output)).min(1_000_000_000_000) }
}
pub fn task_update(data:&mut Data, task:Task)->bool {
    if let Some(old)=data.tasks.iter_mut().find(|t|t.id==task.id) {
        if task.updated_at<old.updated_at { return false; }
        let changed=old.status!=task.status;
        *old=Task { tokens:task.tokens.or(old.tokens),..task }; changed
    } else { data.tasks.push(task); true }
}
pub fn consume(data:&mut Data, cursor:&mut Cursor, value:&Value, fresh_after:u64)->Vec<Task> {
    let mut notices=vec![];
    let kind=value["type"].as_str().unwrap_or(""); let p=&value["payload"];
    let at=value["timestamp"].as_str().and_then(|s|DateTime::parse_from_rfc3339(s).ok()).map(|d|d.timestamp_millis().max(0) as u64).unwrap_or(0);
    if kind=="session_meta" { if let Some(id)=p["id"].as_str() { cursor.session_id=id.chars().take(150).collect(); } }
    if kind=="turn_context" { if let Some(model)=p["model"].as_str() { cursor.model=model.chars().take(100).collect(); }
        if let Some(id)=p["turn_id"].as_str() { cursor.turn_id=id.chars().take(150).collect(); } }
    if kind!="event_msg" || at==0 { return notices; }
    let event=p["type"].as_str().unwrap_or("");
    if let Some(id)=p["turn_id"].as_str() { cursor.turn_id=id.chars().take(150).collect(); }
    if event=="token_count" {
        let quota=parse_quota(&p["rate_limits"],at,"local_log");
        super::quota::merge_log(&mut data.quota,quota);
        let total=&p["info"]["total_token_usage"];
        if total.is_object() {
            let current=tokens(total); let delta=current.delta(&cursor.cumulative); cursor.cumulative=current;
            // Repeated cumulative snapshots must never fall back to last_token_usage.
            if delta.total>0 {
                let id=format!("{}:{}:{}:{}",cursor.turn_id,at,cursor.model,cursor.cumulative.total);
                if data.seen_events.insert(format!("usage:{id}"),at).is_none() { data.usage.push(UsageRecord{id,at,day:day(at),source:"codex".into(),model:cursor.model.clone(),tokens:delta.clone()});
                    if let Some(task)=data.tasks.iter_mut().find(|t|t.session_id==cursor.session_id&&t.turn_id==cursor.turn_id) { task.tokens=Some(task.tokens.unwrap_or(0).saturating_add(delta.total)); } }
            }
        }
    }
    let status=match event { "task_started"=>"running","task_complete"=>"completed","turn_aborted"=>"interrupted","task_failed"=>"failed",_=>return notices };
    if cursor.turn_id.is_empty() { return notices; }
    let task=Task { id:format!("codex:{}:{}",cursor.session_id,cursor.turn_id),source:"codex".into(),session_id:cursor.session_id.clone(),turn_id:cursor.turn_id.clone(),status:status.into(),updated_at:at,tokens:None };
    let event_id=format!("{}:{}",task.id,status);
    let unseen=!data.seen_events.contains_key(&event_id);
    task_update(data,task.clone());
    data.seen_events.insert(event_id,at);
    if unseen&&at>=fresh_after&&status!="running" { notices.push(data.tasks.iter().find(|t|t.id==task.id).unwrap().clone()); }
    notices
}
pub(super) fn list_files(root:&Path, output:&mut Vec<PathBuf>, depth:usize)->Result<(),String> {
    if depth>6 || output.len()>10000 { return Err("会话目录过大，请选择更小的 Codex 数据目录".into()); }
    if !root.exists() { return Ok(()); }
    for entry in fs::read_dir(root).map_err(|_|"无法读取 Codex 会话目录")? {
        let entry=entry.map_err(|_|"无法读取会话文件")?; let ty=entry.file_type().map_err(|_|"无法检查会话文件")?;
        if ty.is_symlink() { continue; }
        if ty.is_dir() { list_files(&entry.path(),output,depth+1)?; }
        else if entry.file_name().to_string_lossy().starts_with("rollout-")&&entry.path().extension().is_some_and(|e|e=="jsonl") {if output.len()>=10000{return Err("会话文件超过 10000 个，请选择更小的目录".into());}output.push(entry.path()); }
    } Ok(())
}
// Only complete lines advance the persisted offset; a growing partial line is retried next scan.
pub(super) fn bounded_line(reader:&mut impl BufRead)->std::io::Result<(Vec<u8>,usize,bool)> {
    let mut line=vec![]; let mut consumed=0; let mut oversized=false;
    loop { let bytes=reader.fill_buf()?; if bytes.is_empty() { return Ok((vec![],consumed,false)); }
        let end=bytes.iter().position(|b|*b==b'\n'); let length=end.map_or(bytes.len(),|n|n+1);
        if !oversized { if line.len()+length<=1024*1024 { line.extend_from_slice(&bytes[..length]); } else { line.clear();oversized=true; } }
        reader.consume(length);consumed+=length;
        if end.is_some() { return Ok((line,consumed,true)); }
    }
}
pub fn scan(data:&mut Data, root:&Path, fresh_after:u64)->Result<Vec<Task>,String> {
    super::recent::scan(data,root,fresh_after,super::now())
}
pub(super) fn scan_history(data:&mut Data, root:&Path, fresh_after:u64)->Result<Vec<Task>,String> {
    if !root.join("sessions").exists() { return Err("未找到 sessions 目录，请检查 Codex 数据目录".into()); }
    let mut files=vec![]; list_files(&root.join("sessions"),&mut files,0)?; list_files(&root.join("archived_sessions"),&mut files,0)?;
    files.sort_by(|a,b|b.file_name().cmp(&a.file_name())); let mut notices=vec![];
    // Upgrade existing ledgers without replaying token counters or task notices.
    // Read at most 8 MiB once, from the tails of the eight newest sessions.
    if !data.credits_backfilled {
        for path in files.iter().take(8) {
            let mut file=File::open(path).map_err(|_|"无法读取积分历史")?;
            let length=file.metadata().map_err(|_|"无法读取积分历史信息")?.len();
            let start=length.saturating_sub(1024*1024);file.seek(SeekFrom::Start(start)).map_err(|_|"无法定位积分历史")?;
            let mut reader=BufReader::new(file.take(length-start));
            if start>0 {bounded_line(&mut reader).map_err(|_|"无法读取积分历史")?;}
            loop {
                let (line,_,complete)=bounded_line(&mut reader).map_err(|_|"无法读取积分历史")?;if !complete{break;}
                if !serde_json::from_slice::<Envelope>(&line).is_ok_and(|e|e.kind=="event_msg"){continue;}
                if let Ok(value)=serde_json::from_slice::<Value>(&line) {
                    if value["payload"]["type"]!="token_count"{continue;}
                    if let Some(at)=value["timestamp"].as_str().and_then(|s|DateTime::parse_from_rfc3339(s).ok()).filter(|d|d.timestamp_millis()>0) {
                        let quota=parse_quota(&value["payload"]["rate_limits"],at.timestamp_millis() as u64,"local_log");
                        super::quota::merge_credits(&mut data.quota,&quota);
                    }
                }
            }
        }
        data.credits_backfilled=true;
    }
    let present=files.iter().filter_map(|p|p.file_name()).map(|n|n.to_string_lossy().into_owned()).collect::<HashSet<_>>();
    let mut total_read=0;data.scan_pending=false;
    for path in &files {
        if total_read>=64*1024*1024 {data.scan_pending=true;break;}
        let key=path.file_name().unwrap().to_string_lossy().into_owned();
        let mut file=File::open(path).map_err(|_|"无法打开 Codex 会话文件")?;
        let length=file.metadata().map_err(|_|"无法读取会话文件信息")?.len();
        let mut prefix=[0u8;256];let count=file.read(&mut prefix).map_err(|_|"无法读取会话文件头")?;
        use std::hash::{Hash,Hasher};let mut hasher=std::collections::hash_map::DefaultHasher::new();prefix[..count].hash(&mut hasher);let prefix=format!("{:x}",hasher.finish());
        let mut cursor=data.cursors.remove(&key).unwrap_or_default();
        if cursor.offset>length || (!cursor.prefix.is_empty() && prefix!=cursor.prefix) { cursor=Cursor::default(); }
        cursor.prefix=prefix; if cursor.session_id.is_empty() { cursor.session_id=key.clone(); }
        if cursor.offset<length {
            file.seek(SeekFrom::Start(cursor.offset)).map_err(|_|"无法定位会话文件")?;
            let mut reader=BufReader::new(file); let mut budget=0;
            loop { let (line,count,complete)=bounded_line(&mut reader).map_err(|_|"读取会话文件失败")?;
                if !complete { break; } cursor.offset+=count as u64; budget+=count;total_read+=count;
                // Inspect the envelope without allocating conversation/tool bodies.
                // JSON field order is not significant; type may follow a long payload.
                let relevant=serde_json::from_slice::<Envelope>(&line).is_ok_and(|e|["event_msg","turn_context","session_meta"].contains(&e.kind.as_str()));
                if relevant {
                    if let Ok(value)=serde_json::from_slice::<Value>(&line) { notices.extend(consume(data,&mut cursor,&value,fresh_after)); }
                }
                if data.usage.len()>22000 || data.tasks.len()>500 { super::prune(data); }
                if budget>=32*1024*1024||total_read>=64*1024*1024 { break; }
            }
        }
        if cursor.offset+1024*1024<length {data.scan_pending=true;}
        data.cursors.insert(key,cursor);
    }
    data.cursors.retain(|key,_|present.contains(key)); data.scanned_files=files.len();
    Ok(notices)
}

#[cfg(test)] mod tests {
    use super::*;use serde_json::json;
    fn sample(total:u64)->Value {json!({"type":"event_msg","timestamp":"2026-09-15T00:00:00Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":total-20,"cached_input_tokens":30,"output_tokens":20,"reasoning_output_tokens":10,"total_tokens":total},"last_token_usage":{"total_tokens":total}}}})}
    #[test] fn repeated_usage_is_not_counted_twice_and_subsets_are_not_added() { let mut d=Data::default();let mut c=Cursor::default();consume(&mut d,&mut c,&sample(100),u64::MAX);consume(&mut d,&mut c,&sample(100),u64::MAX);consume(&mut d,&mut c,&sample(140),u64::MAX);assert_eq!(d.usage.iter().map(|u|u.tokens.total).sum::<u64>(),140);assert_eq!(d.usage.len(),2); }
    #[test] fn credits_upgrade_backfills_consumed_logs_once_without_recounting_usage() {
        let root=std::env::temp_dir().join(format!("desktop-pet-credits-{}",uuid::Uuid::new_v4()));
        let sessions=root.join("sessions");fs::create_dir_all(&sessions).unwrap();
        let mut event=sample(140);event["payload"]["rate_limits"]=json!({"limit_id":"codex","credits":{"has_credits":true,"balance":"1234.5","unlimited":false}});
        fs::write(sessions.join("rollout-credits.jsonl"),format!("{event}\n")).unwrap();
        let mut data=Data::default();scan_history(&mut data,&root,u64::MAX).unwrap();
        let cursors=data.cursors.clone();let count=data.usage.len();
        data.quota.credits.clear();data.credits_backfilled=false;
        assert!(scan_history(&mut data,&root,u64::MAX).unwrap().is_empty());
        assert!(data.credits_backfilled);assert_eq!(data.quota.credits["codex"].balance,Some(1234.5));assert!(data.cursors==cursors);assert_eq!(data.usage.len(),count);
        data.quota.credits.clear();scan_history(&mut data,&root,u64::MAX).unwrap();assert!(data.quota.credits.is_empty());
        fs::remove_dir_all(root).unwrap();
    }
    #[test] fn scan_accepts_event_type_after_long_payload() {
        let root=std::env::temp_dir().join(format!("desktop-pet-scan-order-{}",uuid::Uuid::new_v4()));
        let sessions=root.join("sessions");fs::create_dir_all(&sessions).unwrap();
        let mut row=sample(140);row["payload"]["padding"]=json!("x".repeat(300));
        let line=serde_json::to_string(&row).unwrap();
        assert!(line.find("\"event_msg\"").unwrap()>200);
        fs::write(sessions.join("rollout-order.jsonl"),format!("{line}\n")).unwrap();
        let mut data=Data::default();let result=scan_history(&mut data,&root,u64::MAX);
        fs::remove_dir_all(&root).unwrap();result.unwrap();
        assert_eq!(data.usage.iter().map(|r|r.tokens.total).sum::<u64>(),140);
    }
    #[test] fn partial_line_does_not_commit_and_large_line_is_bounded() { let mut r=std::io::Cursor::new(b"{\"type\":");assert!(!bounded_line(&mut r).unwrap().2);let mut huge=vec![b'x';2*1024*1024];huge.push(b'\n');let result=bounded_line(&mut std::io::Cursor::new(huge)).unwrap();assert!(result.0.is_empty());assert!(result.2); }
    #[test] fn counter_reset_and_fork_copy_do_not_double_count(){let mut d=Data::default();let mut c=Cursor::default();consume(&mut d,&mut c,&sample(140),0);consume(&mut d,&mut c,&sample(40),0);let mut copied=Cursor::default();consume(&mut d,&mut copied,&sample(140),0);consume(&mut d,&mut copied,&sample(40),0);assert_eq!(d.usage.iter().map(|u|u.tokens.total).sum::<u64>(),180);}
    #[test] fn historical_completion_is_silent_and_live_duplicate_deduped() { let mut d=Data::default();let mut c=Cursor{session_id:"s".into(),..Cursor::default()};let e=json!({"type":"event_msg","timestamp":"2026-09-15T00:00:00Z","payload":{"type":"task_complete","turn_id":"t"}});assert!(consume(&mut d,&mut c,&e,u64::MAX).is_empty());assert!(consume(&mut d,&mut c,&e,0).is_empty());assert_eq!(d.tasks.len(),1); }
}
