use crate::*;
use base64::{Engine,engine::general_purpose::STANDARD};
use std::{collections::{HashMap,HashSet},io::Read};
const LIMIT:usize=32*1024*1024;
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Backup {format:String,version:u8,created_at:u64,preferences:Preferences,custom_pets:Vec<Value>}
fn require(ok:bool,message:&str)->Result<(),String>{if ok{Ok(())}else{Err(message.into())}}
fn keys(v:&Value,allowed:&[&str])->Result<(),String>{require(v.as_object().is_some_and(|m|m.keys().all(|k|allowed.contains(&k.as_str()))),"备份包含未知角色字段")}
fn text(v:&Value,max:usize)->bool{v.as_str().is_some_and(|s|s.chars().count()<=max)}
fn id(v:&Value,max:usize)->bool{v.as_str().is_some_and(|s|!s.is_empty()&&s.len()<=max&&s.chars().all(|c|c.is_ascii_alphanumeric()||c=='-'||c=='_'))}
pub fn validate_role(p:&Value)->Result<(),String>{
    keys(p,&["schemaVersion","id","name","description","author","license","renderer","width","height","skins","actions"])?;
    require(p["schemaVersion"]==1&&id(&p["id"],100)&&p["id"].as_str().unwrap().starts_with("custom-"),"角色版本或 ID 无效")?;
    require(text(&p["name"],40)&&!p["name"].as_str().unwrap_or("").trim().is_empty()&&text(&p["description"],120)&&text(&p["author"],60)&&text(&p["license"],120),"角色说明无效")?;
    require([Some("static"),Some("sprite")].contains(&p["renderer"].as_str())&&["width","height"].iter().all(|k|p[k].as_f64().is_some_and(|n|(16.0..=2048.0).contains(&n))),"角色画布无效")?;
    let skins=p["skins"].as_array().ok_or("缺少皮肤")?;require(!skins.is_empty()&&skins.len()<=4,"皮肤数量无效")?;
    let mut skin_ids=HashSet::new();let mut dimensions=vec![];let mut pixels=0u64;let mut decoded_assets=HashMap::new();
    for skin in skins {
        keys(skin,&["id","name","color","assets"])?;
        require(id(&skin["id"],40)&&skin_ids.insert(skin["id"].as_str().unwrap())&&text(&skin["name"],40),"皮肤 ID 或名称无效")?;
        let color=skin["color"].as_str().unwrap_or("");require(color.len()==7&&color.starts_with('#')&&color[1..].bytes().all(|c|c.is_ascii_hexdigit()),"皮肤颜色无效")?;
        let assets=skin["assets"].as_object().ok_or("缺少图片")?;require(!assets.is_empty()&&assets.len()<=32,"图片数量无效")?;
        let mut sizes=HashMap::new();
        for (name,value) in assets {
            require(id(&json!(name),40),"图片键无效")?;
            let raw=value.as_str().and_then(|s|s.strip_prefix("data:image/png;base64,")).ok_or("备份只允许内嵌 PNG，不允许路径或网络资源")?;
            if let Some(size)=decoded_assets.get(raw){sizes.insert(name.as_str(),*size);continue;}
            require(raw.len()<=16*1024*1024,"图片数据过大")?;
            let bytes=STANDARD.decode(raw).map_err(|_|"图片编码无效")?;
            require(bytes.len()>=24&&bytes[..8]==[137,80,78,71,13,10,26,10],"图片不是 PNG")?;
            let w=u32::from_be_bytes(bytes[16..20].try_into().unwrap());let h=u32::from_be_bytes(bytes[20..24].try_into().unwrap());pixels=pixels.saturating_add(w as u64*h as u64);
            require(w>0&&h>0&&w<=8192&&h<=8192&&pixels<=16*1024*1024,"角色图片像素超过限制")?;
            let decoded=tauri::image::Image::from_bytes(&bytes).map_err(|_|"PNG 无法解码")?;
            require(decoded.width()==w&&decoded.height()==h,"图片尺寸不一致")?;let size=(w as f64,h as f64);decoded_assets.insert(raw,size);sizes.insert(name.as_str(),size);
        }dimensions.push(sizes);
    }
    let actions=p["actions"].as_object().ok_or("缺少动作")?;require(actions.contains_key("idle")&&actions.keys().all(|a|["idle","pet","happy","sleepy","drag","celebrate"].contains(&a.as_str())),"动作名称无效或缺少待机")?;
    for clip in actions.values(){keys(clip,&["frames","fps","loop"])?;require(clip["fps"].as_f64().is_some_and(|n|(1.0..=60.0).contains(&n))&&clip["loop"].is_boolean(),"帧率或循环设置无效")?;
        let frames=clip["frames"].as_array().ok_or("缺少动画帧")?;require(!frames.is_empty()&&frames.len()<=120,"动画帧数量无效")?;
        for frame in frames {keys(frame,&["asset","x","y","width","height"])?;let asset=frame["asset"].as_str().ok_or("动画帧引用无效")?;
            require(dimensions.iter().all(|d|d.contains_key(asset)),"动作引用了不存在的图片")?;
            if ["x","y","width","height"].iter().any(|k|frame.get(k).is_some()){
                let get=|k:&str|frame[k].as_f64().filter(|v|v.is_finite()).ok_or("裁剪坐标无效");let(x,y,w,h)=(get("x")?,get("y")?,get("width")?,get("height")?);
                require(x>=0.&&y>=0.&&(1.0..=2048.).contains(&w)&&(1.0..=2048.).contains(&h)&&dimensions.iter().all(|d|x+w<=d[asset].0&&y+h<=d[asset].1),"裁剪区域超出图片")?;
            }
        }
    }Ok(())
}
fn validate(b:&Backup)->Result<(),String>{
    require(b.format=="desktop-pet-backup"&&b.version==1,"不是支持的桌边备份，请选择导出的完整备份 JSON")?;
    require(valid_preferences(&b.preferences)&&b.custom_pets.len()<=6,"偏好或角色数量无效")?;
    let mut ids=HashSet::from(["doubao-static","doubao-sprite"]);for p in &b.custom_pets{validate_role(p)?;require(ids.insert(p["id"].as_str().unwrap()),"角色 ID 重复")?;}
    require(ids.contains(b.preferences.pet_id.as_str()),"选中的角色不在备份中")?;
    let skin_ok=if b.preferences.pet_id.starts_with("doubao-"){["cream","sage"].contains(&b.preferences.skin_id.as_str())}else{b.custom_pets.iter().find(|p|p["id"]==b.preferences.pet_id).unwrap()["skins"].as_array().unwrap().iter().any(|s|s["id"]==b.preferences.skin_id)};
    require(skin_ok,"选中的皮肤不在备份中")?;
    require(b.preferences.pet_names.keys().chain(b.preferences.pet_default_names.keys()).all(|id|ids.contains(id.as_str())),"名称设置引用了不存在的角色")
}
fn parse(text:&str)->Result<Backup,String>{require(text.len()<=LIMIT,"备份不能超过 32 MB")?;let b:Backup=serde_json::from_str(text).map_err(|_|"备份格式无效或包含未知字段")?;validate(&b)?;Ok(b)}
fn from_state(s:Snapshot)->Backup{Backup{format:"desktop-pet-backup".into(),version:1,created_at:now(),preferences:s.preferences,custom_pets:s.custom_pets}}
fn main_only(w:&WebviewWindow)->Result<(),String>{require(w.label()=="main","请在管理窗口中操作备份")}
fn point_path(app:&tauri::AppHandle)->PathBuf{app.state::<Runtime>().path.with_file_name("restore-point.json")}
fn apply(app:&tauri::AppHandle,b:Backup,save_point:bool)->Result<Snapshot,String>{
    let point=point_path(app);let next=mutate(app,|s|{
        if save_point {let bytes=serde_json::to_vec(&from_state(s.clone())).map_err(|_|"无法创建还原点")?;let temp=point.with_extension("tmp");fs::write(&temp,bytes).map_err(|_|"无法创建还原点")?;fs::rename(temp,&point).map_err(|_|"无法保存还原点")?;}
        s.preferences=b.preferences;s.custom_pets=b.custom_pets;Ok(())
    })?;
    if let Some(pet)=app.get_webview_window("pet"){let _=pet.set_always_on_top(next.preferences.topmost);}
    fullscreen::sync_visibility(app)?;
    Ok(next)
}
#[tauri::command]pub async fn export_backup(window:WebviewWindow,app:tauri::AppHandle)->Result<Value,String>{main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move||{let b=from_state(app.state::<Runtime>().data.lock().unwrap().clone());validate(&b)?;serde_json::to_value(b).map_err(|_|"备份编码失败".into())}).await.map_err(|_|"导出备份失败")?
}
#[tauri::command]pub async fn preview_backup(window:WebviewWindow,text:String)->Result<Value,String>{main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move||{let b=parse(&text)?;Ok(json!({"createdAt":b.created_at,"roles":b.custom_pets.iter().map(|p|json!({"id":p["id"],"name":p["name"]})).collect::<Vec<_>>(),"petName":b.preferences.pet_names.get(&b.preferences.pet_id).or_else(||b.preferences.pet_default_names.get(&b.preferences.pet_id)),"selectedId":b.preferences.pet_id}))}).await.map_err(|_|"读取备份失败")?
}
#[tauri::command]pub async fn restore_backup(window:WebviewWindow,app:tauri::AppHandle,text:String)->Result<Snapshot,String>{main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move||apply(&app,parse(&text)?,true)).await.map_err(|_|"恢复备份失败")?
}
#[tauri::command]pub async fn undo_restore(window:WebviewWindow,app:tauri::AppHandle)->Result<Snapshot,String>{main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move||{let file=fs::File::open(point_path(&app)).map_err(|_|"尚无可用还原点")?;let mut text=String::new();file.take(LIMIT as u64+1).read_to_string(&mut text).map_err(|_|"还原点无法读取")?;apply(&app,parse(&text)?,false)}).await.map_err(|_|"撤销恢复失败")?
}
#[tauri::command]pub fn backup_status(window:WebviewWindow,app:tauri::AppHandle)->Result<bool,String>{main_only(&window)?;Ok(point_path(&app).is_file())}
#[cfg(test)]mod tests{use super::*;
    #[test]fn backup_excludes_timer_credentials_and_accepts_old_preferences(){let mut v=serde_json::to_value(from_state(Snapshot::default())).unwrap();assert!(v.get("timer").is_none());assert!(v.get("integrations").is_none());v["preferences"].as_object_mut().unwrap().remove("ambientRange");assert!(parse(&v.to_string()).is_ok());v["apiKey"]=json!("no-secret");assert!(parse(&v.to_string()).is_err());}
    #[test]fn rejects_unknown_selected_roles_and_unsafe_assets(){let mut b=from_state(Snapshot::default());b.preferences.pet_id="missing".into();assert!(validate(&b).is_err());let p=json!({"schemaVersion":1,"id":"custom-a","name":"test","description":"","author":"","license":"","renderer":"static","width":256,"height":256,"skins":[{"id":"a","name":"a","color":"#aabbcc","assets":{"portrait":"https://example.com/a.png"}}],"actions":{"idle":{"frames":[{"asset":"portrait"}],"fps":1,"loop":true}}});assert!(validate_role(&p).is_err());}
}
