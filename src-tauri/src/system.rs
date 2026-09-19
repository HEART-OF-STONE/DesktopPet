use crate::*;
use std::io::Read;
use tauri_plugin_updater::{Update, UpdaterExt};
const OFFICIAL_REPO:&str="HEART-OF-STONE/DesktopPet";
const CHECK_INTERVAL:u64=6*60*60*1000;
fn automatic_default()->bool{true}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase",default)]
struct Updates {repository:String,automatic:bool,checked_at:Option<u64>,latest:Option<Release>,error:Option<String>}
impl Default for Updates {fn default()->Self{Self{repository:OFFICIAL_REPO.into(),automatic:automatic_default(),checked_at:None,latest:None,error:None}}}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct Release {version:String,title:String,notes:String,newer:bool}
#[derive(Default)]
struct Transfer {phase:&'static str,downloaded:u64,total:Option<u64>,message:Option<String>,update:Option<Update>,bytes:Option<Vec<u8>>}
impl Transfer {fn idle()->Self{Self{phase:"idle",..Self::default()}}}
pub struct System {updates:Mutex<Updates>,transfer:Mutex<Transfer>,gate:Mutex<()>,path:PathBuf}
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
fn status(app:&tauri::AppHandle)->Result<Value,String>{
    let startup=read_startup(&startup_name(app))?;let matches=startup.as_ref()==Some(&expected_startup()?);let s=app.state::<System>();
    let updates=s.updates.lock().unwrap().clone();let t=s.transfer.lock().unwrap();
    Ok(json!({"version":app.package_info().version.to_string(),"identifier":app.config().identifier,"managementVisible":app.get_webview_window("main").is_some_and(|w|w.is_visible().unwrap_or(false)),"startupEnabled":startup.is_some(),"startupMatches":matches,"officialRepository":OFFICIAL_REPO,"updates":updates,"transfer":{"phase":t.phase,"downloaded":t.downloaded,"total":t.total,"message":t.message}}))
}
fn notify(app:&tauri::AppHandle){if let Ok(value)=status(app){let _=app.emit_to("main","system-status-changed",value);}}
fn main_only(w:&WebviewWindow)->Result<(),String>{if w.label()=="main"{Ok(())}else{Err("请在管理窗口中操作系统设置".into())}}
pub fn start(app:&tauri::AppHandle,directory:&std::path::Path){
    let path=directory.join("release-settings.json");
    let mut updates=fs::read(&path).ok().filter(|v|v.len()<65536).and_then(|b|serde_json::from_slice::<Updates>(&b).ok()).filter(|u|u.repository.is_empty()||valid_repo(&u.repository)).unwrap_or_default();
    if updates.repository.is_empty(){updates.repository=OFFICIAL_REPO.into();updates.checked_at=None;updates.latest=None;updates.error=None;}
    app.manage(System{updates:Mutex::new(updates),transfer:Mutex::new(Transfer::idle()),gate:Mutex::new(()),path});
    // Test/debug applications never run background network checks.
    if !cfg!(debug_assertions){let app=app.clone();std::thread::spawn(move||{
        std::thread::sleep(Duration::from_secs(30));
        loop{let settings=app.state::<System>().updates.lock().unwrap().clone();
            if settings.automatic&&check_due(settings.checked_at,now(),CHECK_INTERVAL){let _=perform_check(&app,false);}
            std::thread::sleep(Duration::from_secs(60));
        }
    });}
}
fn check_due(last:Option<u64>,current:u64,interval:u64)->bool{last.is_none_or(|at|at>current||current-at>=interval)}
fn normalize_repo(input:&str)->Result<String,String>{
    let value=input.trim().trim_end_matches('/');
    let value=value.strip_prefix("https://github.com/").unwrap_or(value);
    let value=value.strip_suffix(".git").unwrap_or(value);
    if !valid_repo(value){return Err("请输入公开 GitHub 仓库地址或 所有者/仓库名，不要填写访问令牌".into());}
    Ok(if value.eq_ignore_ascii_case(OFFICIAL_REPO){OFFICIAL_REPO.into()}else{value.into()})
}
#[tauri::command]pub fn get_system_status(window:WebviewWindow,app:tauri::AppHandle)->Result<Value,String>{main_only(&window)?;status(&app)}
#[tauri::command]pub fn set_startup(window:WebviewWindow,app:tauri::AppHandle,enabled:bool)->Result<Value,String>{main_only(&window)?;let command=expected_startup()?;write_startup(&startup_name(&app),enabled.then_some(command.as_str()))?;status(&app)}
#[tauri::command]pub async fn set_update_source(window:WebviewWindow,app:tauri::AppHandle,repository:String)->Result<Value,String>{main_only(&window)?;let repository=normalize_repo(&repository)?;
    tauri::async_runtime::spawn_blocking(move||{let s=app.state::<System>();let _guard=s.gate.try_lock().map_err(|_|"更新处理中，请稍后重试")?;let automatic=s.updates.lock().unwrap().automatic;let next=Updates{repository,automatic,..Updates::default()};save(&s,&next)?;*s.updates.lock().unwrap()=next;*s.transfer.lock().unwrap()=Transfer::idle();notify(&app);status(&app)}).await.map_err(|_|"更新源保存失败")?
}
#[tauri::command]pub async fn set_automatic_updates(window:WebviewWindow,app:tauri::AppHandle,enabled:bool)->Result<Value,String>{main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move||{let s=app.state::<System>();let _guard=s.gate.try_lock().map_err(|_|"更新处理中，请稍后重试")?;let mut next=s.updates.lock().unwrap().clone();next.automatic=enabled;save(&s,&next)?;*s.updates.lock().unwrap()=next;notify(&app);status(&app)}).await.map_err(|_|"设置保存失败")?
}
fn perform_check(app:&tauri::AppHandle,manual:bool)->Result<Value,String>{
        let s=app.state::<System>();let _guard=s.gate.try_lock().map_err(|_|"已有更新操作正在进行")?;let mut next=s.updates.lock().unwrap().clone();
        if s.transfer.lock().unwrap().phase=="ready"{return status(app);}
        if !check_due(next.checked_at,now(),if manual{60000}else{CHECK_INTERVAL}){return Err("刚刚检查过，请在一分钟后重试".into());}
        // Persist the attempt before I/O: restarts and failures cannot bypass the throttle.
        next.checked_at=Some(now());save(&s,&next)?;*s.updates.lock().unwrap()=next.clone();
        *s.transfer.lock().unwrap()=Transfer{phase:"checking",..Transfer::default()};notify(app);
        let query=||->Result<Release,String>{
            let client=reqwest::blocking::Client::builder().timeout(Duration::from_secs(12)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"更新检查初始化失败")?;
            let response=client.get(format!("https://api.github.com/repos/{}/releases/latest",next.repository)).header("User-Agent","DesktopPet").header("Accept","application/vnd.github+json").header("X-GitHub-Api-Version","2026-03-10").send().map_err(|_|"无法连接 GitHub，请稍后再试")?;
            match response.status().as_u16(){200=>{},404=>return Err("仓库不存在、非公开或尚未发布稳定版本".into()),403|429=>return Err("GitHub 请求受限，请稍后再试".into()),_=>return Err("发布服务暂不可用".into())}
            let mut bytes=vec![];response.take(1024*1024+1).read_to_end(&mut bytes).map_err(|_|"发布信息读取失败")?;if bytes.len()>1024*1024{return Err("发布信息过大".into());}
            release(serde_json::from_slice(&bytes).map_err(|_|"发布信息格式无效")?,&app.package_info().version.to_string())
        };
        let mut transfer=Transfer::idle();
        match query(){Ok(r)=>{
            if r.newer&&next.repository==OFFICIAL_REPO{
                match signed_update(app,&r.version){Ok(update)=>{transfer.phase="available";transfer.update=Some(update);},Err(message)=>transfer.message=Some(message)}
            }else if r.newer{transfer.message=Some("自定义仓库仅检查版本，请在发布页核对并手动安装。".into());}
            next.latest=Some(r);next.error=None;
        },Err(e)=>next.error=Some(e)}
        *s.transfer.lock().unwrap()=transfer;
        let saved=save(&s,&next);*s.updates.lock().unwrap()=next;notify(app);saved?;status(app)
}
fn trusted_download(url:&reqwest::Url,release_version:&str)->bool{
    let expected=format!("/{OFFICIAL_REPO}/releases/download/v{}/DesktopPet-v{}-windows-x64-setup.exe",release_version.trim_start_matches('v'),release_version.trim_start_matches('v'));
    url.scheme()=="https"&&url.host_str()==Some("github.com")&&url.port().is_none()&&url.username().is_empty()&&url.password().is_none()&&url.query().is_none()&&url.fragment().is_none()&&url.path()==expected
}
fn signed_update(app:&tauri::AppHandle,release_version:&str)->Result<Update,String>{
    let query=||->Result<Option<Update>,tauri_plugin_updater::Error>{
        let updater=app.updater_builder().endpoints(vec![format!("https://github.com/{OFFICIAL_REPO}/releases/latest/download/latest.json").parse().unwrap()])?.timeout(Duration::from_secs(20)).build()?;
        tauri::async_runtime::block_on(updater.check())
    };
    let mut update=query().map_err(|_|"此版本的签名更新信息暂不可用，可稍后重试或打开发布页。")?.ok_or("发布版本与更新清单尚未同步，请稍后重试。")?;
    if version(&update.version)!=version(release_version)||!trusted_download(&update.download_url,&update.version){return Err("更新清单的版本或下载地址不匹配，已禁止应用内安装。".into());}
    update.timeout=Some(Duration::from_secs(300));Ok(update)
}
#[tauri::command]pub async fn check_update(window:WebviewWindow,app:tauri::AppHandle)->Result<Value,String>{main_only(&window)?;tauri::async_runtime::spawn_blocking(move||perform_check(&app,true)).await.map_err(|_|"更新检查失败")?}
#[tauri::command]pub async fn download_update(window:WebviewWindow,app:tauri::AppHandle)->Result<Value,String>{main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let s=app.state::<System>();let _guard=s.gate.try_lock().map_err(|_|"已有更新操作正在进行")?;
        let update={let mut t=s.transfer.lock().unwrap();if t.phase!="available"{return Err("请先检查并找到可安装的更新".into());}let update=t.update.clone().ok_or("更新信息已失效，请重新检查")?;t.phase="downloading";t.downloaded=0;t.total=None;t.message=None;update};notify(&app);
        let mut last=0;
        let result=tauri::async_runtime::block_on(update.download(|chunk,total|{
            {let mut t=s.transfer.lock().unwrap();t.downloaded+=chunk as u64;t.total=total;}
            if now().saturating_sub(last)>250{last=now();notify(&app);}
        },||{{s.transfer.lock().unwrap().phase="verifying";}notify(&app);}));
        {let mut t=s.transfer.lock().unwrap();match result{Ok(bytes)=>{t.bytes=Some(bytes);t.phase="ready";t.message=Some("签名验证通过，点击安装后桌宠会退出并在更新完成后重新启动。".into());},Err(_)=>{t.phase="available";t.bytes=None;t.message=Some("下载或签名验证失败，未安装任何文件。请重试或查看发布页。".into());}}}
        notify(&app);status(&app)
    }).await.map_err(|_|"更新下载失败")?
}
#[tauri::command]pub async fn install_update(window:WebviewWindow,app:tauri::AppHandle)->Result<Value,String>{main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let s=app.state::<System>();let _guard=s.gate.try_lock().map_err(|_|"已有更新操作正在进行")?;
        let (update,bytes)={let mut t=s.transfer.lock().unwrap();if t.phase!="ready"{return Err("请先下载并验证更新包".into());}let update=t.update.clone().ok_or("更新信息失效")?;let bytes=t.bytes.take().ok_or("更新包已失效，请重新下载")?;t.phase="installing";(update,bytes)};notify(&app);
        if update.install(&bytes).is_err(){let mut t=s.transfer.lock().unwrap();t.phase="ready";t.bytes=Some(bytes);t.message=Some("无法启动安装程序，请重试或打开发布页手动安装。".into());}
        notify(&app);status(&app)
    }).await.map_err(|_|"安装更新失败")?
}
#[tauri::command]pub fn open_release_page(window:WebviewWindow,app:tauri::AppHandle)->Result<(),String>{main_only(&window)?;let repo=app.state::<System>().updates.lock().unwrap().repository.clone();if !valid_repo(&repo){return Err("尚未配置有效发布仓库".into());}let url=format!("https://github.com/{repo}/releases/latest");
    #[cfg(windows)]unsafe{let result=windows_sys::Win32::UI::Shell::ShellExecuteW(std::ptr::null_mut(),w("open").as_ptr(),w(&url).as_ptr(),std::ptr::null(),std::ptr::null(),1);if result as isize<=32{return Err("无法打开系统浏览器".into());}}
    Ok(())
}
#[cfg(test)]mod tests{use super::*;
    #[test]fn schedule_and_legacy_preferences(){
        let old:Updates=serde_json::from_value(json!({"repository":"old/repo","checkedAt":1000})).unwrap();assert!(old.automatic);assert_eq!(old.repository,"old/repo");
        assert!(!check_due(Some(1000),1000+CHECK_INTERVAL-1,CHECK_INTERVAL));assert!(check_due(Some(1000),1000+CHECK_INTERVAL,CHECK_INTERVAL));assert!(check_due(None,1000,CHECK_INTERVAL));assert!(check_due(Some(2000),1000,CHECK_INTERVAL));
        assert_eq!(normalize_repo(" https://github.com/HEART-OF-STONE/DesktopPet.git/ ").unwrap(),OFFICIAL_REPO);
        for input in ["https://github.com/owner/repo?token=x","https://github.com.evil/owner/repo",""]{assert!(normalize_repo(input).is_err());}
        assert!(normalize_repo(&["https://","user:pass@","github.com/owner/repo"].concat()).is_err());
    }
    #[test]fn only_expected_official_asset_is_installable(){
        let valid=format!("https://github.com/{OFFICIAL_REPO}/releases/download/v0.9.1/DesktopPet-v0.9.1-windows-x64-setup.exe");
        assert!(trusted_download(&valid.parse().unwrap(),"0.9.1"));assert!(!trusted_download(&valid.parse().unwrap(),"0.9.2"));
        for changed in [valid.replace("https:","http:"),valid.replace("github.com/","github.com.evil/"),valid.replace(OFFICIAL_REPO,"other/repo"),format!("{valid}?token=x"),format!("{valid}#x")]{assert!(!trusted_download(&changed.parse().unwrap(),"0.9.1"));}
    }
    #[test]fn signed_download_accepts_original_and_rejects_tampering(){
        use std::net::TcpListener;
        let payload=include_bytes!("../../scripts/fixtures/update-payload.txt");
        let signature=include_str!("../../scripts/fixtures/update-payload.txt.sig").trim();
        let config:Value=serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let mut context=tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().plugins.0.insert("updater".into(),config["plugins"]["updater"].clone());
        let app=tauri::test::mock_builder().plugin(tauri_plugin_updater::Builder::new().build()).build(context).unwrap();
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();
        let manifest=json!({"version":"99.0.0","platforms":{"windows-x86_64":{"url":format!("http://{address}/payload"),"signature":signature}}}).to_string();
        let server=std::thread::spawn(move||{
            for body in [manifest.into_bytes(),payload.to_vec(),b"tampered download".to_vec()]{
                let (mut stream,_)=listener.accept().unwrap();stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
                let mut request=[0;8192];let _=stream.read(&mut request).unwrap();
                write!(stream,"HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len()).unwrap();stream.write_all(&body).unwrap();
            }
        });
        let updater=app.updater_builder().endpoints(vec![format!("http://{address}/latest.json").parse().unwrap()]).unwrap().no_proxy().timeout(Duration::from_secs(5)).build().unwrap();
        tauri::async_runtime::block_on(async{
            let update=updater.check().await.unwrap().unwrap();let mut progress=0;
            let bytes=update.download(|size,_|progress+=size,||{}).await.unwrap();assert_eq!(bytes,payload);assert_eq!(progress,payload.len());
            assert!(update.download(|_,_|{},||{}).await.is_err());
        });server.join().unwrap();
    }
    #[test]fn version_comparison_and_release_filter(){let value=json!({"tag_name":"v0.10.0","draft":false,"prerelease":false,"body":"notes"});assert!(release(value.clone(),"0.9.9").unwrap().newer);assert!(!release(value,"1.0.0").unwrap().newer);assert!(release(json!({"tag_name":"v2.0.0","draft":false,"prerelease":true}),"0.5.0").is_err());assert!(version("1.2.3-beta").is_none());}
    #[test]fn update_source_cannot_escape_github_path(){assert!(valid_repo("owner/DesktopPet"));for repo in ["https://example.com","../x","a/../x","a/b?token=secret","a/b#x","a/b/c"]{assert!(!valid_repo(repo));}}
}
