mod models;
mod scanner;
mod quota;
mod quota_poll;
mod balance;
mod bridge;
pub mod inbox;
pub mod pricing;
pub use models::*;
use std::{fs,io::Write,path::PathBuf,sync::Mutex,time::Duration};
use serde_json::{json,Value};
use tauri::{Emitter,Manager,WebviewWindow};
pub fn now()->u64 {crate::now()}
pub struct Service { data:Mutex<Data>, refresh:Mutex<()>, path:PathBuf, credential:String, boot:u64, discovery:PathBuf, demo:Mutex<Option<Demo>>, connection:Mutex<Connection>, endpoint:Mutex<Option<(std::net::SocketAddr,String)>> }
fn home(settings:&Settings)->PathBuf { if !settings.codex_home.trim().is_empty() {PathBuf::from(settings.codex_home.trim())} else {std::env::var_os("CODEX_HOME").map(PathBuf::from).unwrap_or_else(||PathBuf::from(std::env::var_os("USERPROFILE").unwrap_or_default()).join(".codex"))} }
fn valid(s:&Settings)->bool { [s.low_balance,s.daily_budget].iter().all(|n|n.is_finite()&&(0.0..=1_000_000.0).contains(n)) && s.codex_home.len()<1024 && s.codex_executable.len()<1024
    && (s.codex_home.is_empty()||PathBuf::from(&s.codex_home).is_absolute()) && (s.codex_executable.is_empty()||PathBuf::from(&s.codex_executable).is_absolute())
    && !s.completion_template.chars().any(char::is_control) && (1..=160).contains(&s.completion_template.chars().count()) && ["none","tokens","quota","balance","estimate"].contains(&s.pet_metric.as_str()) && ["side","bottom","compact"].contains(&s.pet_layout.as_str()) }
pub fn prune(d:&mut Data) { let cutoff=now().saturating_sub(90*86400000);d.usage.retain(|r|r.at>=cutoff);d.usage.sort_by_key(|r|r.at);if d.usage.len()>20000 {d.usage.drain(..d.usage.len()-20000);}
    d.inbox.retain(|i|i.at>=cutoff);if d.inbox.len()>300{d.inbox.drain(..d.inbox.len()-300);}
    d.tasks.sort_by_key(|t|std::cmp::Reverse(t.updated_at));d.tasks.truncate(150);d.seen_events.retain(|_,at|*at>=cutoff);
    d.balance.history.retain(|r|r.at>=cutoff);if d.balance.history.len()>130000 {d.balance.history.drain(..d.balance.history.len()-130000);}
}
fn persist(s:&Service,d:&Data)->Result<(),String> {let bytes=serde_json::to_vec(d).map_err(|_|"联动数据编码失败")?;let temp=s.path.with_extension("tmp");let mut f=fs::File::create(&temp).map_err(|_|"联动数据无法保存")?;f.write_all(&bytes).and_then(|_|f.sync_all()).map_err(|_|"联动数据无法保存")?;
    if s.path.exists(){fs::copy(&s.path,s.path.with_extension("backup.json")).map_err(|_|"联动备份失败")?;}fs::rename(temp,&s.path).map_err(|_|"联动数据无法保存".into())}
fn view(s:&Service,d:&Data)->Value {let today=scanner::day(now());let since=now().saturating_sub(6*86400000);let first=scanner::day(since);let mut total=Tokens::default();let mut week=Tokens::default();let mut days=std::collections::BTreeMap::<String,u64>::new();let mut models=std::collections::BTreeMap::<String,u64>::new();
    for r in &d.usage {if r.day==today{total.add(&r.tokens);}if r.day>=first {week.add(&r.tokens);*days.entry(r.day.clone()).or_default()+=r.tokens.total;*models.entry(format!("{} / {}",r.source,if r.model.is_empty(){"未知模型"}else{&r.model})).or_default()+=r.tokens.total;}}
    let decrease:f64=d.balance.history.iter().filter(|r|r.day==today&&Some(&r.currency)==d.balance.currency.as_ref()).map(|r|r.decrease).sum();
    json!({"settings":d.settings,"today":total,"week":week,"days":days,"models":models,"tasks":d.tasks,"quota":d.quota,"inbox":d.inbox,"estimate":pricing::summarize(d,&today,&first),
        "quotaRefresh":{"enabled":d.settings.codex_enabled,"lastAttemptAt":d.quota_poll.last_attempt_at,"nextAttemptAt":if d.settings.codex_enabled{Some(d.quota_poll.next_auto_at(&d.quota).max(now()))}else{None},"manualAvailableAt":d.quota_poll.next_attempt_at,"failures":d.quota_poll.failures},
        "balance":{"configured":d.balance.configured,"available":d.balance.available,"currency":d.balance.currency,"total":d.balance.total,"granted":d.balance.granted,"toppedUp":d.balance.topped_up,"updatedAt":d.balance.updated_at,"error":d.balance.error,"todayDecrease":decrease,"history":d.balance.history.iter().rev().take(30).collect::<Vec<_>>()},
        "scanAt":d.scan_at,"scanError":d.scan_error,"scannedFiles":d.scanned_files,"scanPending":d.scan_pending,"detectedHome":d.detected_home,"bridgeFile":s.discovery.to_string_lossy(),"retainedRecords":d.usage.len(),"demo":s.demo.lock().unwrap().clone().filter(|d|d.expires_at>now()),
        "connection":s.connection.lock().unwrap().clone(),"senderScript":std::env::current_exe().ok().and_then(|p|p.parent().map(|d|d.join("send-agent-event.ps1"))).filter(|p|p.is_file()).map(|p|p.to_string_lossy().into_owned())})
}
fn task_notices(d:&Data,tasks:Vec<Task>)->Vec<Notice>{tasks.into_iter().filter_map(|task|{let text=match task.status.as_str(){"completed" if d.settings.notify_completed=>d.settings.completion_template.replace("{source}",&task.source).replace("{tokens}",&task.tokens.map(|n|format!("{n} tokens")).unwrap_or("用量暂不可用".into())),"failed" if d.settings.notify_failed=>format!("{} 的任务出错了，请查看 Agent。",task.source),"waiting" if d.settings.notify_approval=>format!("{} 正在等待你确认。",task.source),_=>return None};Some(Notice{id:format!("{}:{}:{}",task.id,task.status,task.updated_at),source:task.source,kind:task.status,text})}).collect()}
fn emit_notices(app:&tauri::AppHandle,notices:Vec<Notice>){for notice in notices{clear_demo(app);let _=app.emit("agent-notice",notice);}}
fn refresh(app:&tauri::AppHandle,live:bool,balance_requested:bool,auto_quota:bool)->Result<Value,String>{let s=app.state::<Service>();let _lock=s.refresh.lock().map_err(|_|"刷新状态不可用")?;
    // Files and network I/O run on a worker, outside the shared snapshot lock.
    let mut next=s.data.lock().map_err(|_|"联动状态不可用")?.clone();let mut tasks=vec![];next.detected_home=home(&next.settings).to_string_lossy().into_owned();
    let root=home(&next.settings);let fresh_after=if next.scan_at.is_none(){now()}else{s.boot};
    if next.settings.codex_enabled {match scanner::scan(&mut next,&root,fresh_after){Ok(t)=>{tasks=t;next.scan_at=Some(now());next.scan_error=None;},Err(e)=>next.scan_error=Some(e)}}
    let quota_requested=(live||auto_quota)&&next.quota_poll.due(&next.quota,now(),next.settings.codex_enabled,live);
    if quota_requested {
        next.quota_poll.reserve(now());
        // Reserve durably before network I/O; a crash must not bypass cooldown.
        let mut reservation=s.data.lock().map_err(|_|"联动状态不可用")?.clone();reservation.quota_poll=next.quota_poll.clone();
        persist(&s,&reservation)?;*s.data.lock().map_err(|_|"联动状态不可用")?=reservation;
        let result=quota::query(&next.settings);next.quota_poll.finish(now(),result.is_ok());
        match result{Ok(q)=>next.quota=q,Err(e)=>next.quota.error=Some(e)}
    }
    let mut balance_updated=false;
    if balance_requested&&next.settings.deepseek_enabled&&next.balance.configured {match balance::query(&s.credential){Ok(v)=>{balance::apply(&mut next.balance,v,now());balance_updated=true;},Err(e)=>next.balance.error=Some(e)}}
    prune(&mut next);let mut balance_notice=None;
    if balance_updated {let day=scanner::day(now());let low=next.balance.total.is_some_and(|v|v<next.settings.low_balance);let spend:f64=next.balance.history.iter().filter(|r|r.day==day&&Some(&r.currency)==next.balance.currency.as_ref()).map(|r|r.decrease).sum();
        let low_notice=low&&!next.balance.low_alert_active;let budget_notice=next.settings.daily_budget>0.&&spend>=next.settings.daily_budget&&next.balance.budget_alert_day!=day;
        next.balance.low_alert_active=low;if budget_notice{next.balance.budget_alert_day=day;}
        if low_notice||budget_notice {balance_notice=Some(Notice{id:uuid::Uuid::new_v4().to_string(),source:"deepseek".into(),kind:"balance".into(),text:if low_notice{"DeepSeek 余额低于提醒阈值，请查看看板。"}else{"今日余额下降已达到预算阈值，请查看看板。"}.into()});}
    }
    let mut notices=task_notices(&next,tasks);if let Some(n)=balance_notice{notices.push(n);}inbox::append(&mut next,&notices,now());
    // A ten-second timestamp change alone must not rewrite the entire ledger.
    let changed={let old=s.data.lock().unwrap();!s.path.exists()||old.cursors!=next.cursors||old.scan_error!=next.scan_error||old.usage.len()!=next.usage.len()||old.seen_events.len()!=next.seen_events.len()||old.inbox.len()!=next.inbox.len()||old.balance.history.len()!=next.balance.history.len()||old.balance.error!=next.balance.error||quota_requested||balance_updated};
    if changed||!notices.is_empty(){persist(&s,&next)?;}emit_notices(app,notices);
    let value=view(&s,&next);*s.data.lock().unwrap()=next;let _=app.emit("integrations-changed",&value);Ok(value)
}
fn main_only(w:&WebviewWindow)->Result<(),String>{if w.label()=="main"{Ok(())}else{Err("请在管理窗口中修改连接".into())}}
fn clear_demo(app:&tauri::AppHandle){if app.state::<Service>().demo.lock().unwrap().take().is_some(){let _=app.emit("agent-demo-changed",Option::<Demo>::None);}}
#[tauri::command]pub fn demo_agent(window:WebviewWindow,app:tauri::AppHandle,kind:String)->Result<Option<Demo>,String>{main_only(&window)?;
    if !["running","completed","waiting","failed","balance","stop"].contains(&kind.as_str()){return Err("未知演示类型".into());}
    let demo=if kind=="stop"{None}else{Some(Demo{id:uuid::Uuid::new_v4().to_string(),kind,expires_at:now()+10000})};
    *app.state::<Service>().demo.lock().map_err(|_|"演示状态不可用")?=demo.clone();app.emit("agent-demo-changed",&demo).map_err(|_|"无法发送演示")?;Ok(demo)
}
#[tauri::command]pub fn get_integrations(app:tauri::AppHandle)->Result<Value,String>{let s=app.state::<Service>();let d=s.data.lock().map_err(|_|"联动状态不可用")?;Ok(view(&s,&d))}
#[tauri::command]pub async fn refresh_integrations(window:WebviewWindow,app:tauri::AppHandle,live:bool)->Result<Value,String>{main_only(&window)?;tauri::async_runtime::spawn_blocking(move||refresh(&app,live,true,false)).await.map_err(|_|"刷新任务失败")?}
#[tauri::command]pub async fn check_connections(window:WebviewWindow,app:tauri::AppHandle)->Result<Value,String>{main_only(&window)?;tauri::async_runtime::spawn_blocking(move||refresh(&app,false,false,false)).await.map_err(|_|"本机检查失败")?}
#[tauri::command]pub async fn test_agent_connection(window:WebviewWindow,app:tauri::AppHandle)->Result<Value,String>{main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        bridge::probe(&app)?;
        let demo=Demo{id:uuid::Uuid::new_v4().to_string(),kind:"completed".into(),expires_at:now()+10000};
        let s=app.state::<Service>();*s.demo.lock().unwrap()=Some(demo.clone());let _=app.emit("agent-demo-changed",demo);
        let v=view(&s,&s.data.lock().unwrap());let _=app.emit("integrations-changed",&v);Ok(v)
    }).await.map_err(|_|"本机通道测试失败")?
}
#[tauri::command]pub async fn update_integrations(window:WebviewWindow,app:tauri::AppHandle,settings:Settings)->Result<Value,String>{main_only(&window)?;if !valid(&settings){return Err("设置无效：目录需为绝对路径，提醒阈值需为 0–1000000，文案为 1–160 字".into());}
    tauri::async_runtime::spawn_blocking(move||{let s=app.state::<Service>();let _lock=s.refresh.lock().map_err(|_|"刷新状态不可用")?;let mut d=s.data.lock().map_err(|_|"联动状态不可用")?;let mut next=d.clone();if home(&next.settings)!=home(&settings){next.cursors.clear();next.usage.retain(|r|r.source!="codex");next.tasks.retain(|t|t.source!="codex");next.seen_events.retain(|key,_|!key.starts_with("codex:")&&!key.starts_with("usage:")&&!key.starts_with("bridge:codex:"));next.quota=Quota::default();next.scan_at=None;next.scanned_files=0;}
        next.settings=settings;next.detected_home=home(&next.settings).to_string_lossy().into_owned();persist(&s,&next)?;*d=next;let v=view(&s,&d);let _=app.emit("integrations-changed",&v);Ok(v)}).await.map_err(|_|"保存任务失败")?
}
#[tauri::command]pub async fn set_deepseek_key(window:WebviewWindow,app:tauri::AppHandle,key:Option<String>)->Result<Value,String>{main_only(&window)?;if key.as_ref().is_some_and(|v|v.len()<8||v.len()>512||v.chars().any(char::is_whitespace)||v.chars().any(char::is_control)){return Err("API Key 格式无效".into());}
    tauri::async_runtime::spawn_blocking(move||{let s=app.state::<Service>();let _lock=s.refresh.lock().map_err(|_|"刷新状态不可用")?;balance::credential(&s.credential,Some(key.as_deref()))?;let mut d=s.data.lock().map_err(|_|"联动状态不可用")?;d.balance=Balance{configured:key.is_some(),..Balance::default()};d.settings.deepseek_enabled=key.is_some();persist(&s,&d)?;let v=view(&s,&d);let _=app.emit("integrations-changed",&v);Ok(v)}).await.map_err(|_|"凭据保存失败")?
}
pub fn start(app:&tauri::AppHandle,directory:&std::path::Path)->Result<(),Box<dyn std::error::Error>>{let path=directory.join("integrations.json");let read=|p:&PathBuf|fs::read(p).ok().filter(|b|b.len()<64*1024*1024).and_then(|b|serde_json::from_slice::<Data>(&b).ok()).filter(|d|d.version==1&&valid(&d.settings));let mut data=read(&path).or_else(||read(&path.with_extension("backup.json"))).unwrap_or_default();
    if !pricing::valid_rates(&data.price_rates){data.price_rates.clear();}
    let credential=format!("{}.deepseek",app.config().identifier);data.balance.configured=balance::credential(&credential,None).ok().flatten().is_some();data.detected_home=home(&data.settings).to_string_lossy().into_owned();prune(&mut data);
    app.manage(Service{data:Mutex::new(data),refresh:Mutex::new(()),path,credential,boot:now(),discovery:directory.join("agent-bridge.json"),demo:Mutex::new(None),connection:Mutex::new(Connection::default()),endpoint:Mutex::new(None)});
    bridge::start(app.clone())?;let handle=app.clone();std::thread::spawn(move||{let mut ticks=0;loop{let _=refresh(&handle,false,ticks%6==0,true);ticks+=1;std::thread::sleep(Duration::from_secs(10));}});Ok(())
}
