//! Recent usage has its own cursors. Optional historical work cannot hold up
//! current balances, live states or the completion indicator for recent usage.
use std::{collections::HashSet,fs::File,io::{BufReader,Read,Seek,SeekFrom},path::Path};
use chrono::{DateTime,Local,TimeZone,Days};
use serde::Deserialize;
use serde_json::Value;
use super::{models::*,scanner::{bounded_line,list_files,consume,tokens,task_update},quota};

const MIB:u64=1024*1024;
#[derive(Deserialize)]
struct Header {timestamp:Option<String>,#[serde(rename="type")] kind:String}
fn timestamp(s:&str)->Option<u64>{DateTime::parse_from_rfc3339(s).ok().and_then(|d|u64::try_from(d.timestamp_millis()).ok())}
fn header(line:&[u8])->Option<Header>{serde_json::from_slice(line).ok()}
pub fn cutoff(at:u64)->u64{
    let local=DateTime::from_timestamp_millis(at as i64).unwrap_or_default().with_timezone(&Local);
    let date=local.date_naive().checked_sub_days(Days::new(6)).unwrap();
    Local.from_local_datetime(&date.and_hms_opt(0,0,0).unwrap()).earliest().map(|d|d.timestamp_millis().max(0) as u64).unwrap_or(at.saturating_sub(7*86400000))
}
fn seed(cursor:&mut Cursor,v:&Value){
    let p=&v["payload"];
    match v["type"].as_str(){
        Some("session_meta")=>{if let Some(id)=p["id"].as_str(){cursor.session_id=id.chars().take(150).collect();}},
        Some("turn_context")=>{if let Some(m)=p["model"].as_str(){cursor.model=m.chars().take(100).collect();}if let Some(t)=p["turn_id"].as_str(){cursor.turn_id=t.chars().take(150).collect();}},
        Some("event_msg")=>{if let Some(t)=p["turn_id"].as_str(){cursor.turn_id=t.chars().take(150).collect();}if p["type"]=="token_count"&&p["info"]["total_token_usage"].is_object(){cursor.cumulative=tokens(&p["info"]["total_token_usage"]);}},
        _=>{}
    }
}
fn read_header(file:&mut File,cursor:&mut Cursor)->Result<(),String>{
    file.rewind().map_err(|_|"无法定位会话")?;
    let mut reader=BufReader::new(file.take(MIB));
    let (line,_,complete)=bounded_line(&mut reader).map_err(|_|"无法读取会话标识")?;
    if complete{if let Ok(v)=serde_json::from_slice::<Value>(&line){if v["type"]=="session_meta"{seed(cursor,&v);}}}Ok(())
}
// Codex appends timestamp-ordered JSONL. Locate a conservative lower bound,
// keeping up to 256 KiB before the boundary. Unknown/oversized probes fall back
// to a full scan of this file, rather than guessing a cumulative baseline.
fn locate(file:&mut File,length:u64,since:u64)->Result<u64,String>{
    let(mut low,mut high)=(0,length);
    while high-low>256*1024 {
        let middle=low+(high-low)/2;file.seek(SeekFrom::Start(middle)).map_err(|_|"无法定位近期日志")?;
        let mut reader=BufReader::new(file.take(MIB));
        let (_,skip,complete)=bounded_line(&mut reader).map_err(|_|"无法读取近期日志")?;if !complete{return Ok(0);}
        let position=middle+skip as u64;
        let (line,count,complete)=bounded_line(&mut reader).map_err(|_|"无法读取近期日志")?;
        let at=header(&line).and_then(|h|h.timestamp).and_then(|s|timestamp(&s));
        if !complete||at.is_none(){return Ok(0);}
        if at.unwrap()<since {low=position+count as u64;}else{high=middle;}
        if low>high {high=low;}
    }Ok(low)
}
fn initialize(file:&mut File,length:u64,since:u64,key:&str)->Result<Cursor,String>{
    let mut cursor=Cursor{session_id:key.into(),..Default::default()};read_header(file,&mut cursor)?;
    let start=locate(file,length,since)?;if start==0{return Ok(cursor);}
    // Find the latest counter and model before the seek point. A bounded
    // fallback to byte zero preserves accuracy for unusual/sparse sessions.
    let from=start.saturating_sub(8*MIB);file.seek(SeekFrom::Start(from)).map_err(|_|"无法定位用量基线")?;
    let mut reader=BufReader::new(file.take(start-from));if from>0{bounded_line(&mut reader).map_err(|_|"无法读取用量基线")?;}
    let(mut counter,mut context)=(false,false);
    loop{let(line,_,complete)=bounded_line(&mut reader).map_err(|_|"无法读取用量基线")?;if !complete{break;}
        if !header(&line).is_some_and(|h|["session_meta","turn_context","event_msg"].contains(&h.kind.as_str())){continue;}
        if let Ok(v)=serde_json::from_slice::<Value>(&line){
            counter|=v["type"]=="event_msg"&&v["payload"]["type"]=="token_count"&&v["payload"]["info"]["total_token_usage"].is_object();
            context|=v["type"]=="turn_context";seed(&mut cursor,&v);
        }
    }
    if counter&&context{cursor.offset=start;}else{cursor=Cursor{session_id:key.into(),..Default::default()};read_header(file,&mut cursor)?;}
    Ok(cursor)
}
fn peek(data:&mut Data,path:&Path,length:u64,key:&str)->Result<(),String>{
    let mut file=File::open(path).map_err(|_|"无法打开最新会话")?;
    let mut cursor=Cursor{session_id:key.into(),..Default::default()};read_header(&mut file,&mut cursor)?;
    let start=length.saturating_sub(MIB);file.seek(SeekFrom::Start(start)).map_err(|_|"无法定位最新快照")?;
    let mut reader=BufReader::new(file.take(length-start));if start>0{bounded_line(&mut reader).map_err(|_|"无法读取最新快照")?;}
    let mut snapshot=Data::default();
    loop{let(line,_,complete)=bounded_line(&mut reader).map_err(|_|"无法读取最新快照")?;if !complete{break;}
        if !header(&line).is_some_and(|h|["session_meta","turn_context","event_msg"].contains(&h.kind.as_str())){continue;}
        if let Ok(v)=serde_json::from_slice::<Value>(&line){consume(&mut snapshot,&mut cursor,&v,u64::MAX);}
    }
    quota::merge_log(&mut data.quota,snapshot.quota);
    for task in snapshot.tasks{task_update(data,task);}
    data.tail_lengths.insert(key.into(),length);Ok(())
}
pub fn scan(data:&mut Data,root:&Path,fresh_after:u64,at:u64)->Result<Vec<Task>,String>{
    if !root.join("sessions").exists(){return Err("未找到 sessions 目录，请检查 Codex 数据目录".into());}
    let mut paths=vec![];list_files(&root.join("sessions"),&mut paths,0)?;list_files(&root.join("archived_sessions"),&mut paths,0)?;
    let since=cutoff(at);let mut files=vec![];let mut present=HashSet::new();let mut skipped=0;
    for path in paths{
        let key=path.file_name().unwrap().to_string_lossy().into_owned();present.insert(key.clone());
        let meta=path.metadata().map_err(|_|"无法读取会话信息")?;
        let modified=meta.modified().ok().and_then(|t|t.duration_since(std::time::UNIX_EPOCH).ok()).map(|t|t.as_millis() as u64).unwrap_or(at);
        if modified<since {skipped+=1;continue;}
        files.push((path,key,meta.len(),modified));
    }
    files.sort_by_key(|f|std::cmp::Reverse(f.3));
    // Balances and live status arrive before large usage files finish scanning.
    for (path,key,length,_) in files.iter().take(8){if data.tail_lengths.get(key)!=Some(length){peek(data,path,*length,key)?;}}
    let(mut bytes,mut completed)=(0u64,0usize);let mut notices=vec![];
    let deadline=std::time::Instant::now()+std::time::Duration::from_millis(350);
    for (path,key,length,_) in &files{
        if bytes>=64*MIB||std::time::Instant::now()>=deadline{break;}
        let mut file=File::open(path).map_err(|_|"无法打开近期会话")?;
        let mut prefix=[0u8;256];let count=file.read(&mut prefix).map_err(|_|"无法读取会话头")?;
        use std::hash::{Hash,Hasher};let mut hash=std::collections::hash_map::DefaultHasher::new();prefix[..count].hash(&mut hash);let prefix=format!("{:x}",hash.finish());
        let mut cursor=data.recent_cursors.remove(key).unwrap_or_default();
        if cursor.prefix.is_empty()||cursor.offset>*length||cursor.prefix!=prefix{cursor=initialize(&mut file,*length,since,key)?;}
        cursor.prefix=prefix;file.seek(SeekFrom::Start(cursor.offset)).map_err(|_|"无法定位近期进度")?;
        let mut reader=BufReader::new(file);let mut file_bytes=0;
        loop{let(line,count,complete)=bounded_line(&mut reader).map_err(|_|"读取近期日志失败")?;if !complete{cursor.observed_length=*length;break;}
            cursor.offset+=count as u64;bytes+=count as u64;file_bytes+=count as u64;
            if let Some(h)=header(&line){if ["session_meta","turn_context","event_msg"].contains(&h.kind.as_str()){
                if let Ok(v)=serde_json::from_slice::<Value>(&line){if h.timestamp.as_deref().and_then(timestamp).unwrap_or(0)<since{seed(&mut cursor,&v);}else{notices.extend(consume(data,&mut cursor,&v,fresh_after));}}
            }}
            if data.usage.len()>22000||data.tasks.len()>500{super::prune(data);}
            if bytes>=64*MIB||file_bytes>=32*MIB||std::time::Instant::now()>=deadline{break;}
        }
        // A partial final line is not a historical backlog; retry on append.
        if cursor.offset>=*length||cursor.observed_length==*length{completed+=1;}
        data.recent_cursors.insert(key.clone(),cursor);
    }
    // Count saved completed cursors too, even if this batch's time budget ended.
    completed=completed.max(files.iter().filter(|(_,key,len,_)|data.recent_cursors.get(key).is_some_and(|c|c.offset>=*len||c.observed_length==*len)).count());
    data.recent_cursors.retain(|k,_|present.contains(k));data.tail_lengths.retain(|k,_|present.contains(k));
    data.scan_pending=completed<files.len();data.scanned_files=present.len();
    data.scan_progress=ScanProgress{eligible_files:files.len(),completed_files:completed,skipped_files:skipped,history_pending:false};
    if data.settings.history_enabled&&!data.scan_pending{
        // Existing v0.9.1 full-history cursors resume in their own lane.
        notices.extend(super::scanner::scan_history(data,root,u64::MAX)?);
        data.scan_progress.history_pending=data.scan_pending;data.scan_pending=false;
    }
    Ok(notices)
}

#[cfg(test)] mod tests{
    use super::*;use serde_json::json;use std::io::Write;
    fn root()->std::path::PathBuf{let p=std::env::temp_dir().join(format!("desktop-pet-recent-{}",uuid::Uuid::new_v4()));std::fs::create_dir_all(p.join("sessions")).unwrap();p}
    fn usage(at:&str,n:u64)->Value{json!({"timestamp":at,"type":"event_msg","payload":{"type":"token_count","turn_id":"t","info":{"total_token_usage":{"input_tokens":n,"total_tokens":n}},"rate_limits":{"limit_id":"codex","primary":{"used_percent":42,"window_minutes":10080},"credits":{"balance":"1234.5"}}}})}
    fn context(at:&str)->Value{json!({"timestamp":at,"type":"turn_context","payload":{"turn_id":"t","model":"synthetic-model"}})}
    fn finish(d:&mut Data,p:&Path,at:u64){for _ in 0..100{scan(d,p,u64::MAX,at).unwrap();if !d.scan_pending{return;}}panic!("recent scan did not finish");}
    #[test] fn old_active_session_seeks_and_uses_baseline_then_resumes_without_double_counting(){
        let p=root();let path=p.join("sessions/rollout-old-active.jsonl");let mut f=File::create(&path).unwrap();
        let old="2026-09-01T00:00:00Z";let new="2026-09-22T00:00:00Z";let at=timestamp(new).unwrap();
        writeln!(f,"{}",json!({"timestamp":old,"type":"session_meta","payload":{"id":"s"}})).unwrap();
        for _ in 0..3000{writeln!(f,"{}",context(old)).unwrap();writeln!(f,"{}",usage(old,1000)).unwrap();writeln!(f,"{}",json!({"timestamp":old,"type":"response_item","payload":"x".repeat(2048)})).unwrap();}
        let old_length=f.metadata().unwrap().len();writeln!(f,"{}",context(new)).unwrap();writeln!(f,"{}",usage(new,1040)).unwrap();drop(f);
        let mut file=File::open(&path).unwrap();let seed=initialize(&mut file,old_length,cutoff(at),"fallback").unwrap();assert!(seed.offset>0);assert_eq!(seed.cumulative.total,1000);assert_eq!(seed.model,"synthetic-model");drop(file);
        let mut d=Data::default();finish(&mut d,&p,at);assert_eq!(d.usage.iter().map(|r|r.tokens.total).sum::<u64>(),40);assert_eq!(d.quota.credits["codex"].balance,Some(1234.5));assert!(d.cursors.is_empty());
        let mut restored:Data=serde_json::from_str(&serde_json::to_string(&d).unwrap()).unwrap();
        let mut f=std::fs::OpenOptions::new().append(true).open(&path).unwrap();writeln!(f,"{}",usage("2026-09-22T00:01:00Z",1060)).unwrap();drop(f);
        finish(&mut restored,&p,at+60000);assert_eq!(restored.usage.iter().map(|r|r.tokens.total).sum::<u64>(),60);
        restored.settings.history_enabled=true;for _ in 0..20{scan(&mut restored,&p,u64::MAX,at+60000).unwrap();if !restored.scan_progress.history_pending{break;}}
        assert!(!restored.scan_progress.history_pending);assert_eq!(restored.usage.iter().filter(|r|r.at>=cutoff(at)).map(|r|r.tokens.total).sum::<u64>(),60);
        std::fs::remove_dir_all(p).unwrap();
    }
    #[test] fn inactive_history_is_skipped_and_partial_append_is_retried(){
        let p=root();let old="2026-09-01T00:00:00Z";let new="2026-09-22T00:00:00Z";let at=timestamp(new).unwrap();
        let path=p.join("sessions/rollout-inactive.jsonl");std::fs::write(&path,format!("{}\n",usage(old,1000))).unwrap();
        let old_time=std::time::UNIX_EPOCH+std::time::Duration::from_millis(timestamp(old).unwrap());File::options().write(true).open(&path).unwrap().set_times(std::fs::FileTimes::new().set_modified(old_time)).unwrap();
        let active=p.join("sessions/rollout-active.jsonl");let row=usage(new,40).to_string();let split=row.len()/2;std::fs::write(&active,&row[..split]).unwrap();
        let mut d=Data::default();finish(&mut d,&p,at);assert_eq!(d.scan_progress.skipped_files,1);assert!(d.usage.is_empty());assert!(d.cursors.is_empty());
        let mut f=std::fs::OpenOptions::new().append(true).open(&active).unwrap();writeln!(f,"{}",&row[split..]).unwrap();drop(f);
        finish(&mut d,&p,at);assert_eq!(d.usage.iter().map(|r|r.tokens.total).sum::<u64>(),40);
        d.settings.history_enabled=true;scan(&mut d,&p,u64::MAX,at).unwrap();assert!(!d.scan_pending);assert!(d.usage.iter().any(|r|r.at==timestamp(old).unwrap()));
        std::fs::remove_dir_all(p).unwrap();
    }
    #[test] fn prefetched_completion_still_notifies_once(){
        let mut d=Data::default();let mut c=Cursor{session_id:"s".into(),..Default::default()};let at="2026-09-22T00:00:00Z";
        let v=json!({"timestamp":at,"type":"event_msg","payload":{"type":"task_complete","turn_id":"t"}});
        let mut snapshot=Data::default();consume(&mut snapshot,&mut c,&v,u64::MAX);for t in snapshot.tasks{task_update(&mut d,t);}
        assert_eq!(consume(&mut d,&mut c,&v,0).len(),1);assert!(consume(&mut d,&mut c,&v,0).is_empty());
    }
}
