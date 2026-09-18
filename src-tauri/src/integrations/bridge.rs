use super::*;
use std::{io::{Read,Write},net::{TcpListener,TcpStream},time::Instant};
fn accept(d:&mut Data,e:AgentEvent,clock:u64)->Result<Vec<Task>,String>{
    let identifier=|s:&str|max_len(s,150)&&s.chars().all(|c|c.is_ascii_alphanumeric()||"-_.:".contains(c));
    if !identifier(&e.event_id)||!identifier(&e.source)||!identifier(&e.session_id)||!identifier(&e.turn_id)||!matches!(e.status.as_str(),"running"|"completed"|"failed"|"waiting"|"interrupted")||e.timestamp>clock+300000||e.timestamp<clock.saturating_sub(86400000)||e.model.as_ref().is_some_and(|m|!max_len(m,100)||m.chars().any(char::is_control)) {return Err("事件字段无效".into());}
    if let Some(t)=&e.tokens {if e.source=="codex"||t.total>1_000_000_000||t.cached>t.input||t.reasoning>t.output||t.total!=t.input.saturating_add(t.output){return Err("用量必须为增量，Codex 用量仅由日志采集".into());}}
    let id=format!("bridge:{}:{}",e.source,e.event_id);if d.seen_events.contains_key(&id){return Ok(vec![]);}d.seen_events.insert(id.clone(),e.timestamp);
    if let Some(tokens)=e.tokens.clone(){d.usage.push(UsageRecord{id,at:e.timestamp,day:scanner::day(e.timestamp),source:e.source.clone(),model:e.model.unwrap_or_default(),tokens});}
    let task_id=format!("{}:{}:{}",e.source,e.session_id,e.turn_id);
    let previous=d.tasks.iter().find(|t|t.id==task_id).and_then(|t|t.tokens).unwrap_or(0);
    let task=Task{id:task_id,source:e.source,session_id:e.session_id,turn_id:e.turn_id,status:e.status,updated_at:e.timestamp,tokens:e.tokens.map(|t|previous.saturating_add(t.total))};
    let changed=scanner::task_update(d,task.clone());Ok(if changed{vec![task]}else{vec![]})
}
fn max_len(s:&str,n:usize)->bool{!s.is_empty()&&s.len()<=n}
enum Request {Event(AgentEvent),Probe}
fn request(stream:&mut TcpStream,token:&str)->Result<Request,u16>{let mut bytes=vec![];let boundary=loop{let mut b=[0];if stream.read(&mut b).map_err(|_|400u16)?==0{return Err(400);}bytes.push(b[0]);if bytes.ends_with(b"\r\n\r\n"){break bytes.len();}if bytes.len()>8192{return Err(413);}};
    let header=std::str::from_utf8(&bytes[..boundary]).map_err(|_|400u16)?;let mut lines=header.split("\r\n");let probe=match lines.next(){Some("POST /v1/events HTTP/1.1")=>false,Some("POST /v1/probe HTTP/1.1")=>true,_=>return Err(404)};let mut authorized=false;let mut length=None;let mut content=false;
    for line in lines.filter(|l|!l.is_empty()){let (name,value)=line.split_once(':').ok_or(400u16)?;let value=value.trim();match name.to_ascii_lowercase().as_str(){"authorization"=>authorized=value==format!("Bearer {token}"),"origin"|"transfer-encoding"=>return Err(403),"content-length"=>{if length.is_some(){return Err(400);}length=Some(value.parse::<usize>().map_err(|_|400u16)?);},"content-type"=>content=value.split(';').next()==Some("application/json"),_=>{}}}
    let length=length.ok_or(411u16)?;if length>8192{return Err(413);}let mut body=vec![0;length];stream.read_exact(&mut body).map_err(|_|400u16)?;
    // Drain a bounded body before replying, otherwise closing with unread bytes can
    // reset the TCP connection and hide the useful 401 response from the caller.
    if !authorized{return Err(401);}if !content{return Err(415);}
    if probe {if serde_json::from_slice::<Value>(&body).ok()!=Some(json!({})){return Err(422);}Ok(Request::Probe)}else{serde_json::from_slice(&body).map(Request::Event).map_err(|_|400)}
}
pub fn probe(app:&tauri::AppHandle)->Result<(),String>{
    let s=app.state::<Service>();if !s.data.lock().unwrap().settings.bridge_enabled{return Err("请先开启本地事件接口".into());}
    let (address,token)=s.endpoint.lock().unwrap().clone().ok_or("本机监听尚未就绪，请重启桌边")?;
    // Use the in-memory loopback endpoint, never an editable discovery URL or proxy.
    let mut stream=TcpStream::connect_timeout(&address,Duration::from_secs(3)).map_err(|_|"无法连接本机事件通道")?;
    stream.set_read_timeout(Some(Duration::from_secs(4))).map_err(|_|"测试超时设置失败")?;
    stream.set_write_timeout(Some(Duration::from_secs(3))).map_err(|_|"测试超时设置失败")?;
    write!(stream,"POST /v1/probe HTTP/1.1\r\nHost: {address}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}").map_err(|_|"测试请求发送失败")?;
    let mut response=String::new();stream.take(4096).read_to_string(&mut response).map_err(|_|"本机测试超时，请稍后重试")?;
    if !response.starts_with("HTTP/1.1 200 "){return Err("事件通道拒绝测试，请确认接口已开启并稍后重试".into());}Ok(())
}
pub fn start(app:tauri::AppHandle)->Result<(),Box<dyn std::error::Error>>{let listener=TcpListener::bind("127.0.0.1:0")?;let token=uuid::Uuid::new_v4().to_string();let s=app.state::<Service>();*s.endpoint.lock().unwrap()=Some((listener.local_addr()?,token.clone()));fs::write(&s.discovery,serde_json::to_vec(&json!({"url":format!("http://127.0.0.1:{}/v1/events",listener.local_addr()?.port()),"token":token}))?)?;
    std::thread::spawn(move||{let mut recent=std::collections::VecDeque::new();for stream in listener.incoming(){let Ok(mut stream)=stream else{break};let _=stream.set_read_timeout(Some(Duration::from_secs(2)));let _=stream.set_write_timeout(Some(Duration::from_secs(2)));let at=Instant::now();while recent.front().is_some_and(|old|at.duration_since(*old)>Duration::from_secs(60)){recent.pop_front();}
        let status=if recent.len()>=120{429}else{recent.push_back(at);match request(&mut stream,&token){Err(code)=>code,
            Ok(Request::Probe)=>{let s=app.state::<Service>();if !s.data.lock().unwrap().settings.bridge_enabled{503}else{s.connection.lock().unwrap().tested_at=Some(now());200}},
            Ok(Request::Event(event))=>{let s=app.state::<Service>();let _lock=s.refresh.lock().unwrap();let mut d=s.data.lock().unwrap();if !d.settings.bridge_enabled{503}else{let mut next=d.clone();let source=event.source.clone();match accept(&mut next,event,now()){Err(_)=>422,Ok(tasks)=>{prune(&mut next);let notices=task_notices(&next,tasks.into_iter().filter(|t|t.updated_at>=s.boot).collect());inbox::append(&mut next,&notices,now());if persist(&s,&next).is_err(){500}else{*d=next;{let mut c=s.connection.lock().unwrap();c.last_event_at=Some(now());c.last_source=Some(source);}emit_notices(&app,notices);let _=app.emit("integrations-changed",view(&s,&d));200}}}}}}};
        let body=if status==200{"{\"ok\":true}"}else{"{\"ok\":false}"};let _=write!(stream,"HTTP/1.1 {status} Result\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
    }});Ok(())
}
#[cfg(test)]mod tests{use super::*;
    fn event()->AgentEvent{AgentEvent{event_id:"event-1".into(),source:"test-agent".into(),session_id:"s".into(),turn_id:"t".into(),status:"completed".into(),timestamp:now(),model:Some("test".into()),tokens:Some(Tokens{input:80,cached:20,output:20,reasoning:10,total:100})}}
    #[test]fn dedup_survives_restart_and_rejects_codex_usage(){let mut d=Data::default();assert_eq!(accept(&mut d,event(),now()).unwrap().len(),1);let mut d:Data=serde_json::from_slice(&serde_json::to_vec(&d).unwrap()).unwrap();assert!(accept(&mut d,event(),now()).unwrap().is_empty());assert_eq!(d.usage.len(),1);let mut e=event();e.source="codex".into();assert!(accept(&mut d,e,now()).is_err());}
    #[test]fn rejects_future_and_invalid_subset(){let mut d=Data::default();let mut e=event();e.timestamp=now()+600000;assert!(accept(&mut d,e,now()).is_err());let mut e=event();e.tokens.as_mut().unwrap().cached=90;assert!(accept(&mut d,e,now()).is_err());}
}
