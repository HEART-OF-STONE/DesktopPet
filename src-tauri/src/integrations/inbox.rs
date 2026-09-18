use super::*;
pub fn append(d:&mut Data,notices:&[Notice],clock:u64){
    for n in notices {if !d.inbox.iter().any(|i|i.id==n.id){d.inbox.push(InboxItem{id:n.id.clone(),source:n.source.clone(),kind:n.kind.clone(),text:n.text.clone(),at:clock,read:false});}}
    d.inbox.retain(|i|i.at>=clock.saturating_sub(90*86400000));
    if d.inbox.len()>300{d.inbox.drain(..d.inbox.len()-300);}
}
fn change(d:&mut Data,action:&str,id:Option<&str>)->Result<(),String>{
    match action {
        "read-all"=>d.inbox.iter_mut().for_each(|i|i.read=true),
        "clear-read"=>d.inbox.retain(|i|!i.read),
        "read"|"unread"=>{let item=d.inbox.iter_mut().find(|i|Some(i.id.as_str())==id).ok_or("提醒已不存在")?;item.read=action=="read";},
        _=>return Err("未知收件箱操作".into()),
    }Ok(())
}
#[tauri::command]
pub async fn update_inbox(window:WebviewWindow,app:tauri::AppHandle,action:String,id:Option<String>)->Result<Value,String>{
    main_only(&window)?;tauri::async_runtime::spawn_blocking(move||{
        let s=app.state::<Service>();let _guard=s.refresh.lock().map_err(|_|"收件箱忙碌中")?;let mut d=s.data.lock().unwrap();let mut next=d.clone();
        change(&mut next,&action,id.as_deref())?;persist(&s,&next)?;*d=next;let v=view(&s,&d);let _=app.emit("integrations-changed",&v);Ok(v)
    }).await.map_err(|_|"收件箱更新失败")?
}
#[cfg(test)]mod tests{use super::*;
    #[test]fn inbox_dedup_read_restore_and_clear(){let mut d=Data::default();let n=Notice{id:"a".into(),source:"codex".into(),kind:"completed".into(),text:"完成".into()};append(&mut d,&[n.clone(),n],100);assert_eq!(d.inbox.len(),1);change(&mut d,"read",Some("a")).unwrap();let mut restored:Data=serde_json::from_slice(&serde_json::to_vec(&d).unwrap()).unwrap();assert!(restored.inbox[0].read);change(&mut restored,"unread",Some("a")).unwrap();change(&mut restored,"clear-read",None).unwrap();assert_eq!(restored.inbox.len(),1);change(&mut restored,"read-all",None).unwrap();change(&mut restored,"clear-read",None).unwrap();assert!(restored.inbox.is_empty());}
    #[test]fn bounded_retention(){let mut d=Data::default();for n in 0..305{append(&mut d,&[Notice{id:n.to_string(),source:"test".into(),kind:"waiting".into(),text:"test".into()}],100);}assert_eq!(d.inbox.len(),300);append(&mut d,&[],91*86400000);assert!(d.inbox.is_empty());}
}
