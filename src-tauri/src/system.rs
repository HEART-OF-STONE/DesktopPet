use crate::*;
use std::io::Read;
#[derive(Clone,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase",default)]
struct Updates {repository:String,checked_at:Option<u64>,latest:Option<Release>,error:Option<String>}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct Release {version:String,title:String,notes:String,newer:bool}
pub struct System {updates:Mutex<Updates>,gate:Mutex<()>,path:PathBuf}
fn w(s:&str)->Vec<u16>{s.encode_utf16().chain(Some(0)).collect()}
const RUN:&str="Software\\Microsoft\\Windows\\CurrentVersion\\Run";
fn startup_name(app:&tauri::AppHandle)->String{format!("DesktopPet.{}",app.config().identifier)}
fn expected_startup()->Result<String,String>{let exe=std::env::current_exe().map_err(|_|"无法定位程序")?;Ok(format!("\"{}\" --autostart",exe.display()))}
fn read_startup(name:&str)->Result<Option<String>,String>{
    #[cfg(windows)]unsafe{
        use windows_sys::Win32::System::Registry::*;
        let mut bytes=0;let code=RegGetValueW(HKEY_CURRENT_USER,w(RUN).as_ptr(),w(name).as_ptr(),RRF_RT_REG_SZ,std::ptr::null_mut(),std::ptr::null_mut(),&mut bytes);
        if code==2{return Ok(None);}if code!=0||bytes>32768{return Err("无法读取开机启动设置".into());}
        let mut buffer=vec![0u16;(bytes as usize/2)+1];let code=RegGetValueW(HKEY_CURRENT_USER,w(RUN).as_ptr(),w(name).as_ptr(),RRF_RT_REG_SZ,std::ptr::null_mut(),buffer.as_mut_ptr().cast(),&mut bytes);
        if code!=0{return Err("无法读取开机启动设置".into());}let end=buffer.iter().position(|c|*c==0).unwrap_or(buffer.len());Ok(Some(String::from_utf16_lossy(&buffer[..end])))
    }
    #[cfg(not(windows))]{let _=name;Ok(None)}
}
fn write_startup(name:&str,value:Option<&str>)->Result<(),String>{
    #[cfg(windows)]unsafe{
        use windows_sys::Win32::System::Registry::*;
        if let Some(value)=value{let mut key=std::ptr::null_mut();let code=RegCreateKeyExW(HKEY_CURRENT_USER,w(RUN).as_ptr(),0,std::ptr::null(),0,KEY_SET_VALUE,std::ptr::null(),&mut key,std::ptr::null_mut());if code!=0{return Err("无法设置当前用户开机启动".into());}
            let value=w(value);let code=RegSetValueExW(key,w(name).as_ptr(),0,REG_SZ,value.as_ptr().cast(),(value.len()*2) as u32);RegCloseKey(key);if code!=0{return Err("无法保存开机启动设置".into());}
        }else{let code=RegDeleteKeyValueW(HKEY_CURRENT_USER,w(RUN).as_ptr(),w(name).as_ptr());if code!=0&&code!=2{return Err("无法关闭开机启动".into());}}Ok(())
    }
    #[cfg(not(windows))]{let _=(name,value);Err("当前仅支持 Windows 开机启动".into())}
}
fn valid_repo(repo:&str)->bool{let parts=repo.split('/').collect::<Vec<_>>();parts.len()==2&&parts.iter().all(|s|!s.is_empty()&&s.len()<=100&&*s!="."&&*s!=".."&&s.bytes().all(|b|b.is_ascii_alphanumeric()||b"-_.".contains(&b)))}
fn version(value:&str)->Option<[u64;3]>{let value=value.strip_prefix('v').unwrap_or(value);let p=value.split('.').map(|v|if v.is_empty()||v.len()>12||!v.bytes().all(|b|b.is_ascii_digit()){None}else{v.parse::<u64>().ok()}).collect::<Option<Vec<_>>>()?;p.try_into().ok()}
fn release(value:Value,current:&str)->Result<Release,String>{
    if value["draft"]!=false||value["prerelease"]!=false{return Err("尚无稳定发布版本".into());}
    let tag=value["tag_name"].as_str().ok_or("发布版本缺失")?;let latest=version(tag).ok_or("版本标签应使用 v主版本.次版本.修订号")?;
    Ok(Release{version:tag.into(),title:value["name"].as_str().unwrap_or(tag).chars().take(120).collect(),notes:value["body"].as_str().unwrap_or("").chars().take(3000).collect(),newer:latest>version(current).ok_or("本地版本无效")?})
}
fn save(s:&System,value:&Updates)->Result<(),String>{let temp=s.path.with_extension("tmp");fs::write(&temp,serde_json::to_vec(value).map_err(|_|"版本配置编码失败")?).map_err(|_|"版本配置保存失败")?;fs::rename(temp,&s.path).map_err(|_|"版本配置保存失败".into())}
fn status(app:&tauri::AppHandle)->Result<Value,String>{let startup=read_startup(&startup_name(app))?;let matches=startup.as_ref()==Some(&expected_startup()?);let s=app.state::<System>();Ok(json!({"version":app.package_info().version.to_string(),"identifier":app.config().identifier,"managementVisible":app.get_webview_window("main").is_some_and(|w|w.is_visible().unwrap_or(false)),"startupEnabled":startup.is_some(),"startupMatches":matches,"updates":s.updates.lock().unwrap().clone()}))}
fn main_only(w:&WebviewWindow)->Result<(),String>{if w.label()=="main"{Ok(())}else{Err("请在管理窗口中操作系统设置".into())}}
pub fn start(app:&tauri::AppHandle,directory:&std::path::Path){let path=directory.join("release-settings.json");let updates=fs::read(&path).ok().filter(|v|v.len()<65536).and_then(|b|serde_json::from_slice::<Updates>(&b).ok()).filter(|u|u.repository.is_empty()||valid_repo(&u.repository)).unwrap_or_else(||Updates{repository:option_env!("DESKTOPPET_RELEASE_REPOSITORY").filter(|r|valid_repo(r)).unwrap_or("").into(),..Updates::default()});app.manage(System{updates:Mutex::new(updates),gate:Mutex::new(()),path});}
#[tauri::command]pub fn get_system_status(window:WebviewWindow,app:tauri::AppHandle)->Result<Value,String>{main_only(&window)?;status(&app)}
#[tauri::command]pub fn set_startup(window:WebviewWindow,app:tauri::AppHandle,enabled:bool)->Result<Value,String>{main_only(&window)?;let command=expected_startup()?;write_startup(&startup_name(&app),enabled.then_some(command.as_str()))?;status(&app)}
#[tauri::command]pub async fn set_update_source(window:WebviewWindow,app:tauri::AppHandle,repository:String)->Result<Value,String>{main_only(&window)?;let repository=repository.trim().to_string();if !repository.is_empty()&&!valid_repo(&repository){return Err("请输入 所有者/仓库名，不要填写网址或访问令牌".into());}
    tauri::async_runtime::spawn_blocking(move||{let s=app.state::<System>();let _guard=s.gate.lock().unwrap();let next=Updates{repository,..Updates::default()};save(&s,&next)?;*s.updates.lock().unwrap()=next;status(&app)}).await.map_err(|_|"更新源保存失败")?
}
#[tauri::command]pub async fn check_update(window:WebviewWindow,app:tauri::AppHandle)->Result<Value,String>{main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let s=app.state::<System>();let _guard=s.gate.lock().unwrap();let mut next=s.updates.lock().unwrap().clone();if next.repository.is_empty(){return Err("尚未配置发布仓库".into());}
        if next.checked_at.is_some_and(|at|now().saturating_sub(at)<60000){return Err("刚刚检查过，请在一分钟后重试".into());}
        next.checked_at=Some(now());let query=||->Result<Release,String>{
            let client=reqwest::blocking::Client::builder().timeout(Duration::from_secs(12)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"更新检查初始化失败")?;
            let response=client.get(format!("https://api.github.com/repos/{}/releases/latest",next.repository)).header("User-Agent","DesktopPet").header("Accept","application/vnd.github+json").header("X-GitHub-Api-Version","2026-03-10").send().map_err(|_|"无法连接 GitHub，请稍后再试")?;
            match response.status().as_u16(){200=>{},404=>return Err("仓库不存在、非公开或尚未发布稳定版本".into()),403|429=>return Err("GitHub 请求受限，请稍后再试".into()),_=>return Err("发布服务暂不可用".into())}
            let mut bytes=vec![];response.take(1024*1024+1).read_to_end(&mut bytes).map_err(|_|"发布信息读取失败")?;if bytes.len()>1024*1024{return Err("发布信息过大".into());}
            release(serde_json::from_slice(&bytes).map_err(|_|"发布信息格式无效")?,&app.package_info().version.to_string())
        };
        match query(){Ok(r)=>{next.latest=Some(r);next.error=None;},Err(e)=>next.error=Some(e)}save(&s,&next)?;*s.updates.lock().unwrap()=next;status(&app)
    }).await.map_err(|_|"更新检查失败")?
}
#[tauri::command]pub fn open_release_page(window:WebviewWindow,app:tauri::AppHandle)->Result<(),String>{main_only(&window)?;let repo=app.state::<System>().updates.lock().unwrap().repository.clone();if !valid_repo(&repo){return Err("尚未配置有效发布仓库".into());}let url=format!("https://github.com/{repo}/releases/latest");
    #[cfg(windows)]unsafe{let result=windows_sys::Win32::UI::Shell::ShellExecuteW(std::ptr::null_mut(),w("open").as_ptr(),w(&url).as_ptr(),std::ptr::null(),std::ptr::null(),1);if result as isize<=32{return Err("无法打开系统浏览器".into());}}
    Ok(())
}
#[cfg(test)]mod tests{use super::*;
    #[test]fn version_comparison_and_release_filter(){let value=json!({"tag_name":"v0.10.0","draft":false,"prerelease":false,"body":"notes"});assert!(release(value.clone(),"0.9.9").unwrap().newer);assert!(!release(value,"1.0.0").unwrap().newer);assert!(release(json!({"tag_name":"v2.0.0","draft":false,"prerelease":true}),"0.5.0").is_err());assert!(version("1.2.3-beta").is_none());}
    #[test]fn update_source_cannot_escape_github_path(){assert!(valid_repo("owner/DesktopPet"));for repo in ["https://example.com","../x","a/../x","a/b?token=secret","a/b#x","a/b/c"]{assert!(!valid_repo(repo));}}
}
