#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod integrations;
mod backup;
mod system;
mod placement;
mod fullscreen;
use integrations::{get_integrations,update_integrations,refresh_integrations,set_deepseek_key,demo_agent};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::BTreeMap, fs, io::Write, path::PathBuf, sync::Mutex, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::{Emitter, Manager, PhysicalPosition, WebviewWindow};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Preferences {
    pet_id: String, skin_id: String, scale: f64, sound: bool, volume: f64,
    topmost: bool, snap: bool, quiet: bool, pet_visible: bool,
    #[serde(default="panel_side")] panel_side:String,
    #[serde(default="panel_scale")] panel_scale:f64,
    #[serde(default="ambient_enabled")] avoid_fullscreen:bool,
    #[serde(default)]
    pet_names: BTreeMap<String, String>,
    #[serde(default)]
    pet_default_names: BTreeMap<String, String>,
    #[serde(default)] bubble_offset_x:f64,
    #[serde(default)] bubble_offset_y:f64,
    #[serde(default="ambient_enabled")] ambient_enabled:bool,
    #[serde(default="ambient_frequency")] ambient_frequency:String,
    #[serde(default="ambient_range")] ambient_range:String,
}
fn ambient_enabled()->bool{true}
fn panel_side()->String{"auto".into()}
fn panel_scale()->f64{1.}
fn ambient_frequency()->String{"normal".into()}
fn ambient_range()->String{"still".into()}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Timer { status: String, duration_ms: u64, remaining_ms: u64, ends_at: Option<u64> }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot { version: u8, preferences: Preferences, timer: Timer, custom_pets: Vec<Value> }
impl Default for Snapshot {
    fn default() -> Self { Self {
        version: 1, preferences: Preferences { pet_id: "doubao-static".into(), skin_id: "cream".into(), scale: 1., sound: false, volume: 0.25, topmost: true, snap: true, quiet: false, pet_visible: true, panel_side:panel_side(),panel_scale:1.,avoid_fullscreen:true,pet_names: BTreeMap::new(), pet_default_names: BTreeMap::new(), bubble_offset_x:0.,bubble_offset_y:0.,ambient_enabled:true,ambient_frequency:ambient_frequency(),ambient_range:ambient_range() },
        timer: Timer { status: "idle".into(), duration_ms: 1_500_000, remaining_ms: 1_500_000, ends_at: None }, custom_pets: vec![],
    } }
}
#[derive(Clone, Serialize, Deserialize)]
struct HitRegion { x: f64, y: f64, width: f64, height: f64 }
#[derive(Clone)]
struct Drag { cursor: (f64, f64), origin: (i32, i32), moved: bool, previous_x:f64, direction:i8 }
fn drag_direction(previous_x:&mut f64,x:f64,scale:f64,current:i8)->i8{
    let delta=x-*previous_x;
    if delta.abs()<2.*scale{return current;}
    *previous_x=x;if delta<0. {-1} else {1}
}
struct Runtime { data: Mutex<Snapshot>, regions: Mutex<Vec<HitRegion>>, placement: Mutex<Option<HitRegion>>, anchor:Mutex<Option<HitRegion>>, drag: Mutex<Option<Drag>>, avoided:Mutex<bool>, path: PathBuf }
fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
fn persist(runtime: &Runtime, state: &Snapshot) -> Result<(), String> {
    let bytes = serde_json::to_vec(state).map_err(|e| e.to_string())?;
    if bytes.len() > 32 * 1024 * 1024 { return Err("角色数据过大，请先移除不需要的角色".into()); }
    let temp = runtime.path.with_extension("tmp");
    let mut file = fs::File::create(&temp).map_err(|e| e.to_string())?;
    file.write_all(&bytes).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
    if runtime.path.exists() { fs::copy(&runtime.path, runtime.path.with_extension("backup.json")).map_err(|e| e.to_string())?; }
    fs::rename(&temp, &runtime.path).map_err(|e| e.to_string())
}
fn mutate(app: &tauri::AppHandle, f: impl FnOnce(&mut Snapshot) -> Result<(), String>) -> Result<Snapshot, String> {
    let runtime = app.state::<Runtime>();
    let mut data = runtime.data.lock().map_err(|_| "状态暂时不可用")?;
    let mut next = data.clone(); f(&mut next)?; persist(&runtime, &next)?; *data = next.clone();
    drop(data);
    app.emit("state-changed", &next).map_err(|e| e.to_string())?;
    if let Some(pet) = app.get_webview_window("pet") { let _ = pet.set_title(&pet_display_name(&next)); }
    Ok(next)
}
fn valid_preferences(p: &Preferences) -> bool {
    p.scale.is_finite() && (0.65..=1.35).contains(&p.scale) && p.volume.is_finite() && (0.0..=1.0).contains(&p.volume)
        && p.panel_scale.is_finite() && (0.8..=1.25).contains(&p.panel_scale) && ["auto","left","right"].contains(&p.panel_side.as_str())
        && p.pet_id.len() <= 100 && p.skin_id.len() <= 100
        && [p.bubble_offset_x,p.bubble_offset_y].iter().all(|n|n.is_finite()&&(-120.0..=120.0).contains(n))
        && ["low","normal","lively"].contains(&p.ambient_frequency.as_str()) && ["still","small","medium"].contains(&p.ambient_range.as_str())
        && [&p.pet_names, &p.pet_default_names].iter().all(|names| names.len() <= 8 && names.iter().all(|(id, name)|
            !id.is_empty() && id.len() <= 100 && !name.is_empty() && name.trim() == name
                && name.chars().count() <= 24 && !name.chars().any(char::is_control)))
}
fn pet_display_name(s: &Snapshot) -> String {
    let id = &s.preferences.pet_id;
    if let Some(name) = s.preferences.pet_names.get(id) { return name.clone(); }
    if let Some(name) = s.preferences.pet_default_names.get(id) { return name.clone(); }
    if let Some(name) = s.custom_pets.iter().find(|p| p["id"].as_str() == Some(id.as_str())).and_then(|p| p["name"].as_str()) { return name.into(); }
    if id == "doubao-sprite" { "啾咪 · 动画版".into() } else { "啾咪".into() }
}
#[tauri::command]
fn get_snapshot(app: tauri::AppHandle) -> Result<Snapshot, String> { Ok(app.state::<Runtime>().data.lock().map_err(|_| "状态暂时不可用")?.clone()) }
#[tauri::command]
fn update_preferences(app: tauri::AppHandle, patch: Value) -> Result<Snapshot, String> {
    let next = mutate(&app, |s| {
        let mut value = serde_json::to_value(&s.preferences).map_err(|e| e.to_string())?;
        let fields = patch.as_object().ok_or("设置格式无效")?;
        for (key, val) in fields { if value.get(key).is_none() { return Err("未知设置".into()); } value[key] = val.clone(); }
        let prefs: Preferences = serde_json::from_value(value).map_err(|_| "设置内容无效")?;
        if !valid_preferences(&prefs) { return Err("设置超出允许范围".into()); }
        s.preferences = prefs; Ok(())
    })?;
    if let Some(pet) = app.get_webview_window("pet") {
        pet.set_always_on_top(next.preferences.topmost).map_err(|e| e.to_string())?;
        fullscreen::sync_visibility(&app)?;
    }
    Ok(next)
}
fn timer_transition(t: &mut Timer, action: &str, minutes: f64, clock: u64) -> Result<(), String> {
    match action {
        "start" => { if !minutes.is_finite() || !(1.0..=180.0).contains(&minutes) { return Err("时长应为 1–180 分钟".into()); }
            let ms = (minutes * 60000.).round() as u64; *t = Timer { status: "running".into(), duration_ms: ms, remaining_ms: ms, ends_at: Some(clock + ms) }; }
        "pause" if t.status == "running" => { t.remaining_ms = t.ends_at.unwrap_or(clock).saturating_sub(clock); t.ends_at = None; t.status = if t.remaining_ms == 0 { "done" } else { "paused" }.into(); }
        "resume" if t.status == "paused" => { t.ends_at = Some(clock + t.remaining_ms); t.status = "running".into(); }
        "reset" => { t.status = "idle".into(); t.ends_at = None; t.remaining_ms = t.duration_ms; }
        "tick" if t.status == "running" && t.ends_at.is_some_and(|at| at <= clock) => { t.status = "done".into(); t.remaining_ms = 0; t.ends_at = None; }
        "pause" | "resume" | "tick" => {},
        _ => return Err("未知计时操作".into()),
    }; Ok(())
}
#[tauri::command]
fn timer_action(app: tauri::AppHandle, action: String, minutes: Option<f64>) -> Result<Snapshot, String> {
    if !["start", "pause", "resume", "reset"].contains(&action.as_str()) { return Err("未知计时操作".into()); }
    mutate(&app, |s| timer_transition(&mut s.timer, &action, minutes.unwrap_or(25.), now()))
}
#[tauri::command]
fn add_pet(app: tauri::AppHandle, pack: Value) -> Result<Snapshot, String> {
    if !pack["id"].as_str().is_some_and(|s| s.starts_with("custom-") && s.len() <= 100)
        || ![Some("static"), Some("sprite")].contains(&pack["renderer"].as_str()) || pack["schemaVersion"] != 1
        || !pack["name"].as_str().is_some_and(|s| s.chars().count() <= 40) { return Err("角色格式无效".into()); }
    let skins = pack["skins"].as_array().ok_or("缺少皮肤")?;
    if skins.is_empty() || skins.len() > 4 { return Err("皮肤数量无效".into()); }
    for skin in skins { for asset in skin["assets"].as_object().ok_or("缺少图片")?.values() {
        if !asset.as_str().is_some_and(|s| s.starts_with("data:image/png;base64,")) { return Err("仅允许本地 PNG 数据".into()); }
    } }
    mutate(&app, |s| { if s.custom_pets.len() >= 6 { return Err("最多导入 6 个角色，请先移除一个".into()); }
        if s.custom_pets.iter().any(|p| p["id"] == pack["id"]) { return Err("角色已存在".into()); }
        s.preferences.pet_id = pack["id"].as_str().unwrap().into(); s.preferences.skin_id = skins[0]["id"].as_str().ok_or("皮肤 ID 无效")?.into();
        s.custom_pets.push(pack.clone()); Ok(()) })
}
#[tauri::command]
fn remove_pet(app: tauri::AppHandle, id: String) -> Result<Snapshot, String> {
    mutate(&app, |s| { s.custom_pets.retain(|p| p["id"] != id);
        s.preferences.pet_names.remove(&id);
        s.preferences.pet_default_names.remove(&id);
        if s.preferences.pet_id == id { s.preferences.pet_id = "doubao-static".into(); s.preferences.skin_id = "cream".into(); } Ok(()) })
}
#[tauri::command]
fn trigger_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
    if !["idle", "pet", "happy", "sleepy", "drag", "celebrate"].contains(&action.as_str()) { return Err("未知动作".into()); }
    app.emit("pet-action", action).map_err(|e| e.to_string())
}
#[tauri::command]
fn preview_ambient(window:WebviewWindow,app:tauri::AppHandle,kind:String)->Result<(),String>{
    if window.label()!="main"||!["stretch","look","doze","stroll","stop"].contains(&kind.as_str()){return Err("未知陪伴预览".into());}
    app.emit("ambient-preview",kind).map_err(|e|e.to_string())
}
#[tauri::command]
fn update_hit_regions(window: WebviewWindow, app: tauri::AppHandle, regions: Vec<HitRegion>, placement:Option<HitRegion>, reposition:Option<bool>, anchor:Option<HitRegion>) -> Result<HitRegion, String> {
    if window.label() != "pet" || regions.len() > 256 || regions.iter().any(|r| ![r.x,r.y,r.width,r.height].iter().all(|v| v.is_finite() && v.abs() <= 2048.) || r.width < 0. || r.height < 0.) { return Err("命中区域无效".into()); }
    if placement.as_ref().is_some_and(|r| ![r.x,r.y,r.width,r.height].iter().all(|v|v.is_finite()&&v.abs()<=2048.)||r.width<=0.||r.height<=0.) {return Err("放置区域无效".into());}
    if anchor.as_ref().is_some_and(|r| ![r.x,r.y,r.width,r.height].iter().all(|v|v.is_finite()&&v.abs()<=2048.)||r.width<=0.||r.height<=0.) {return Err("角色区域无效".into());}
    let runtime=app.state::<Runtime>();
    *runtime.regions.lock().map_err(|_| "命中状态不可用")? = regions;
    *runtime.anchor.lock().map_err(|_|"角色区域不可用")?=anchor;
    let first={let mut stored=runtime.placement.lock().map_err(|_|"放置区域不可用")?;let first=stored.is_none()&&placement.is_some();*stored=placement;first};
    if (first||reposition==Some(true))&&runtime.drag.lock().map_err(|_|"拖动状态不可用")?.is_none() {place_pet(&app,false)?;}
    let monitor=placement_monitor(&app,false)?;let area=monitor.work_area();
    let pos=window.outer_position().map_err(|e|e.to_string())?;let size=window.inner_size().map_err(|e|e.to_string())?;let scale=window.scale_factor().map_err(|e|e.to_string())?;
    let x=(area.position.x-pos.x).max(0).min(size.width as i32) as f64;
    let y=(area.position.y-pos.y).max(0).min(size.height as i32) as f64;
    let right=(area.position.x+area.size.width as i32-pos.x).max(0).min(size.width as i32) as f64;
    let bottom=(area.position.y+area.size.height as i32-pos.y).max(0).min(size.height as i32) as f64;
    Ok(HitRegion{x:x/scale,y:y/scale,width:(right-x).max(0.)/scale,height:(bottom-y).max(0.)/scale})
}
#[tauri::command]
fn begin_drag(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    if window.label() != "pet" { return Err("仅宠物窗口可以拖动".into()); }
    let p = window.outer_position().map_err(|e| e.to_string())?;
    let c = window.cursor_position().map_err(|e| e.to_string())?;
    *app.state::<Runtime>().drag.lock().map_err(|_| "拖动状态不可用")? = Some(Drag {cursor:(c.x,c.y), origin:(p.x,p.y), moved:false,previous_x:c.x,direction:0});
    Ok(())
}
fn show_main(app: &tauri::AppHandle) { if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); } }
fn placement_monitor(app:&tauri::AppHandle,reset:bool)->Result<tauri::Monitor,String>{
    let w=app.get_webview_window("pet").ok_or("宠物窗口不存在")?;
    if reset{return w.primary_monitor().map_err(|e|e.to_string())?.ok_or("未找到显示器".into());}
    let pos=w.outer_position().map_err(|e|e.to_string())?;let scale=w.scale_factor().map_err(|e|e.to_string())?;
    let runtime=app.state::<Runtime>();
    let bounds=runtime.anchor.lock().map_err(|_|"角色区域不可用")?.clone().or_else(||runtime.placement.lock().ok().and_then(|r|r.clone()));
    if let Some(b)=bounds {let x=pos.x as f64+(b.x+b.width/2.)*scale;let y=pos.y as f64+(b.y+b.height/2.)*scale;
        if let Some(m)=w.available_monitors().map_err(|e|e.to_string())?.into_iter().min_by(|a,b|{
            let distance=|m:&tauri::Monitor|{let r=m.work_area();let dx=(r.position.x as f64-x).max(0.).max(x-(r.position.x as f64+r.size.width as f64));let dy=(r.position.y as f64-y).max(0.).max(y-(r.position.y as f64+r.size.height as f64));dx*dx+dy*dy};
            distance(a).total_cmp(&distance(b))}){return Ok(m);}
    }
    w.current_monitor().map_err(|e|e.to_string())?.ok_or("未找到显示器".into())
}
fn place_pet(app: &tauri::AppHandle, reset: bool) -> Result<(), String> {
    let w = app.get_webview_window("pet").ok_or("宠物窗口不存在")?;
    let monitor = placement_monitor(app,reset)?;
    let area = monitor.work_area(); let size = w.outer_size().map_err(|e| e.to_string())?;
    let pos = w.outer_position().map_err(|e| e.to_string())?;
    let scale=w.scale_factor().map_err(|e|e.to_string())?;
    let bounds=app.state::<Runtime>().placement.lock().map_err(|_|"放置区域不可用")?.clone().unwrap_or(HitRegion{x:0.,y:0.,width:size.width as f64/scale,height:size.height as f64/scale});
    let snap = app.state::<Runtime>().data.lock().map_err(|_| "设置不可用")?.preferences.snap;
    let x=placement::axis(pos.x,area.position.x,area.size.width,bounds.x,bounds.width,scale,snap,reset);
    let y=placement::axis(pos.y,area.position.y,area.size.height,bounds.y,bounds.height,scale,snap,reset);
    w.set_position(PhysicalPosition::new(x,y)).map_err(|e| e.to_string())?;
    let position_path = app.state::<Runtime>().path.with_file_name("position.json");
    fs::write(position_path, json!({"x":x,"y":y}).to_string()).map_err(|e| e.to_string())?; Ok(())
}
#[tauri::command]
fn desktop_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
    match action.as_str() { "settings" => show_main(&app), "inbox"=>{show_main(&app);let _=app.emit("navigate-page","inbox");}, "agent-dashboard"=>{show_main(&app);let _=app.emit("navigate-page","agents");}, "reset-position" => { place_pet(&app, true)?; update_preferences(app.clone(), json!({"petVisible":true}))?; },
        "hide" => { update_preferences(app, json!({"petVisible":false}))?; }, "quit" => app.exit(0), _ => return Err("未知窗口操作".into()) } Ok(())
}
fn left_down() -> bool {
    #[cfg(windows)] { unsafe { windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState(1) < 0 } }
    #[cfg(not(windows))] { false }
}
fn start_services(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut ignored = false; let mut ticks = 0;
        loop {
            std::thread::sleep(Duration::from_millis(32));
            let Some(pet) = app.get_webview_window("pet") else { break; };
            let runtime = app.state::<Runtime>();
            if let (Ok(cursor), Ok(origin), Ok(scale)) = (pet.cursor_position(), pet.outer_position(), pet.scale_factor()) {
                let mut drag_guard = runtime.drag.lock().unwrap();
                if let Some(drag) = drag_guard.as_mut() {
                    let dx = cursor.x-drag.cursor.0; let dy = cursor.y-drag.cursor.1;
                    let was_moved=drag.moved;
                    if dx*dx + dy*dy > 36.*scale*scale { drag.moved = true; }
                    if left_down() {
                        if drag.moved {
                            let direction=drag_direction(&mut drag.previous_x,cursor.x,scale,drag.direction);
                            if !was_moved||direction!=drag.direction {drag.direction=direction;let _=app.emit("pet-drag-direction",direction);}
                        }
                        if drag.moved { let _ = pet.set_position(PhysicalPosition::new(drag.origin.0 + dx as i32, drag.origin.1 + dy as i32)); }
                        if ignored { let _ = pet.set_ignore_cursor_events(false); ignored = false; }
                    } else {
                        let moved = drag.moved; *drag_guard = None; drop(drag_guard);
                        if moved { let _ = place_pet(&app, false); }
                        let _ = app.emit("pet-gesture", if moved { "drag" } else { "pet" });
                    }
                } else {
                    drop(drag_guard);
                    let local = ((cursor.x - origin.x as f64)/scale, (cursor.y-origin.y as f64)/scale);
                    let hit = runtime.regions.lock().unwrap().iter().any(|r| local.0 >= r.x && local.0 <= r.x+r.width && local.1 >= r.y && local.1 <= r.y+r.height);
                    if ignored == hit { let _ = pet.set_ignore_cursor_events(!hit); ignored = !hit; }
                }
            }
            ticks += 1;
            if ticks % 16 == 0 { let _=fullscreen::sync_visibility(&app); }
            if ticks % 31 == 0 {
                let expired = { let data = runtime.data.lock().unwrap(); data.timer.status == "running" && data.timer.ends_at.is_some_and(|at| at <= now()) };
                if expired { let _ = mutate(&app, |s| timer_transition(&mut s.timer, "tick", 25., now())); }
            }
            if ticks % 310 == 0 && runtime.drag.lock().unwrap().is_none() {
                // A disconnected display must never leave the pet unreachable.
                if let Ok(pos) = pet.outer_position() { if let Ok(monitors) = pet.available_monitors() {
                    let bounds=runtime.placement.lock().unwrap().clone();let scale=pet.scale_factor().unwrap_or(1.);
                    let visible = monitors.iter().any(|m| { let a=m.work_area(); if let Some(b)=bounds.as_ref(){placement::overlaps(pos.x,pos.y,b,scale,a.position.x,a.position.y,a.size.width,a.size.height)}else{true} });
                    if !visible { let _ = place_pet(&app, true); }
                } }
            }
        }
    });
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {if !args.iter().any(|a|a=="--autostart"){show_main(app)}}))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_snapshot, update_preferences, timer_action, add_pet, remove_pet, trigger_action, preview_ambient,
            begin_drag, update_hit_regions, desktop_action, get_integrations, update_integrations, refresh_integrations,
            set_deepseek_key, demo_agent, integrations::check_connections, integrations::test_agent_connection,
            integrations::inbox::update_inbox, backup::export_backup, backup::preview_backup, backup::restore_backup,
            integrations::pricing::update_price_rates,
            backup::undo_restore, backup::backup_status, system::get_system_status, system::set_startup,
            system::set_update_source, system::check_update, system::open_release_page,
            system::set_automatic_updates, system::download_update, system::install_update
        ])
        .setup(|app| {
            let directory = std::env::var_os("DESKTOPPET_DATA_DIR").map(PathBuf::from).unwrap_or(app.path().app_data_dir()?);
            fs::create_dir_all(&directory)?;
            let path = directory.join("state.json");
            let read_state = |p: &PathBuf| fs::read(p).ok().filter(|b| b.len() <= 32*1024*1024).and_then(|b| serde_json::from_slice::<Snapshot>(&b).ok()).filter(|s| s.version == 1 && valid_preferences(&s.preferences));
            let data = read_state(&path).or_else(|| read_state(&path.with_extension("backup.json"))).unwrap_or_default();
            app.manage(Runtime { data:Mutex::new(data.clone()), regions:Mutex::new(vec![]), placement:Mutex::new(None), anchor:Mutex::new(None), drag:Mutex::new(None), avoided:Mutex::new(false), path });
            let pet = app.get_webview_window("pet").unwrap();
            pet.set_title(&pet_display_name(&data))?;
            pet.set_focusable(false)?;
            pet.set_always_on_top(data.preferences.topmost)?;
            if let Ok(value) = fs::read(directory.join("position.json")).map(|b| serde_json::from_slice::<Value>(&b)) {
                if let Ok(v) = value { if let (Some(x),Some(y))=(v["x"].as_i64(),v["y"].as_i64()) { pet.set_position(PhysicalPosition::new(x.clamp(-100000,100000) as i32,y.clamp(-100000,100000) as i32))?; } }
            } else { let _ = place_pet(app.handle(), true); }
            // Clamp a restored position after the renderer reports visible bounds.
            fullscreen::sync_visibility(app.handle())?;
            use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder};
            let menu = Menu::with_items(app, &[
                &MenuItem::with_id(app,"show","显示宠物",true,None::<&str>)?,
                &MenuItem::with_id(app,"settings","打开桌边",true,None::<&str>)?,
                &MenuItem::with_id(app,"reset","移回主屏",true,None::<&str>)?,
                &MenuItem::with_id(app,"quiet","切换免打扰",true,None::<&str>)?,
                &MenuItem::with_id(app,"quit","退出桌边",true,None::<&str>)?,
            ])?;
            TrayIconBuilder::new().icon(app.default_window_icon().unwrap().clone()).tooltip("桌边 · 你的桌面伙伴").menu(&menu)
                .on_menu_event(|app,event| { match event.id.as_ref() {
                    "show" => { let _ = update_preferences(app.clone(),json!({"petVisible":true})); }, "settings" => show_main(app),
                    "reset" => { let _ = desktop_action(app.clone(),"reset-position".into()); },
                    "quiet" => { let quiet=app.state::<Runtime>().data.lock().unwrap().preferences.quiet; let _ = update_preferences(app.clone(),json!({"quiet":!quiet})); },
                    "quit" => app.exit(0), _ => {} } }).build(app)?;
            system::start(app.handle(),&directory);
            integrations::start(app.handle(),&directory)?;
            if !std::env::args().any(|arg|arg=="--autostart"){if let Some(main)=app.get_webview_window("main"){main.show()?;}}
            start_services(app.handle().clone()); Ok(())
        })
        .on_window_event(|window,event| { if window.label()=="main" { if let tauri::WindowEvent::CloseRequested{api,..}=event { api.prevent_close(); let _=window.hide(); } } })
        .run(tauri::generate_context!()).expect("DesktopPet failed to start");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn desktop_presentation_defaults_validation_and_roundtrip(){
        let mut value=serde_json::to_value(Snapshot::default().preferences).unwrap();
        for key in ["panelSide","panelScale","avoidFullscreen"]{value.as_object_mut().unwrap().remove(key);}
        let mut prefs:Preferences=serde_json::from_value(value).unwrap();
        assert_eq!(prefs.panel_side,"auto");assert_eq!(prefs.panel_scale,1.);assert!(prefs.avoid_fullscreen);
        prefs.panel_side="left".into();prefs.panel_scale=1.25;prefs.avoid_fullscreen=false;assert!(valid_preferences(&prefs));
        let restored:Preferences=serde_json::from_slice(&serde_json::to_vec(&prefs).unwrap()).unwrap();assert_eq!(restored.panel_side,"left");assert!(!restored.avoid_fullscreen);
        prefs.panel_scale=f64::NAN;assert!(!valid_preferences(&prefs));prefs.panel_scale=1.3;assert!(!valid_preferences(&prefs));prefs.panel_scale=1.;prefs.panel_side="unknown".into();assert!(!valid_preferences(&prefs));
    }
    #[test] fn drag_follows_reversal_and_ignores_subpixel_jitter(){
        let mut x=100.;assert_eq!(drag_direction(&mut x,90.,1.,0),-1);
        assert_eq!(drag_direction(&mut x,91.,1.,-1),-1);
        assert_eq!(drag_direction(&mut x,93.,1.,-1),1);
        assert_eq!(drag_direction(&mut x,90.,2.,1),1);
        assert_eq!(drag_direction(&mut x,88.,2.,1),-1);
    }
    #[test] fn old_preferences_default_bubble_offsets_and_validate_bounds(){
        let mut value=serde_json::to_value(Snapshot::default().preferences).unwrap();
        value.as_object_mut().unwrap().remove("bubbleOffsetX");value.as_object_mut().unwrap().remove("bubbleOffsetY");
        let mut p:Preferences=serde_json::from_value(value).unwrap();assert_eq!((p.bubble_offset_x,p.bubble_offset_y),(0.,0.));
        p.bubble_offset_x=-120.;p.bubble_offset_y=120.;assert!(valid_preferences(&p));
        let restored:Preferences=serde_json::from_slice(&serde_json::to_vec(&p).unwrap()).unwrap();assert_eq!(restored.bubble_offset_y,120.);
        p.bubble_offset_x=121.;assert!(!valid_preferences(&p));p.bubble_offset_x=f64::NAN;assert!(!valid_preferences(&p));
    }
    #[test] fn timer_survives_pause_resume_and_overdue_resume() {
        let mut t=Snapshot::default().timer;
        timer_transition(&mut t,"start",1.,1000).unwrap();
        timer_transition(&mut t,"pause",1.,21000).unwrap(); assert_eq!(t.remaining_ms,40000);
        timer_transition(&mut t,"resume",1.,200000).unwrap(); assert_eq!(t.ends_at,Some(240000));
        timer_transition(&mut t,"tick",1.,300000).unwrap(); assert_eq!(t.status,"done");
        timer_transition(&mut t,"tick",1.,400000).unwrap(); assert_eq!(t.status,"done");
    }
    #[test] fn rejects_invalid_duration_and_scale() {
        assert!(timer_transition(&mut Snapshot::default().timer,"start",f64::NAN,0).is_err());
        let mut p=Snapshot::default().preferences; p.scale=9.; assert!(!valid_preferences(&p));
    }
    #[test] fn legacy_save_restores_settings_without_names_and_new_names_survive_roundtrip() {
        let mut old = serde_json::to_value(Snapshot::default()).unwrap();
        old["preferences"].as_object_mut().unwrap().remove("petNames");
        old["preferences"].as_object_mut().unwrap().remove("petDefaultNames");
        for field in ["ambientEnabled","ambientFrequency","ambientRange"] {old["preferences"].as_object_mut().unwrap().remove(field);}
        old["preferences"]["skinId"] = json!("sage");
        let mut state: Snapshot = serde_json::from_value(old).unwrap();
        assert!(valid_preferences(&state.preferences));
        assert!(state.preferences.ambient_enabled);assert_eq!(state.preferences.ambient_range,"still");assert_eq!(state.preferences.ambient_frequency,"normal");
        assert_eq!(state.preferences.skin_id, "sage");
        assert_eq!(pet_display_name(&state), "啾咪");
        state.preferences.pet_names.insert("doubao-static".into(), "小团子 🐾".into());
        let restored: Snapshot = serde_json::from_slice(&serde_json::to_vec(&state).unwrap()).unwrap();
        assert_eq!(pet_display_name(&restored), "小团子 🐾");
        state.preferences.pet_id = "doubao-sprite".into();
        assert_eq!(pet_display_name(&state), "啾咪 · 动画版");
        state.preferences.pet_id = "doubao-static".into();
        state.preferences.pet_default_names.insert("doubao-static".into(), "年糕".into());
        assert_eq!(pet_display_name(&state), "小团子 🐾");
        state.preferences.pet_names.remove("doubao-static");
        let restored: Snapshot = serde_json::from_slice(&serde_json::to_vec(&state).unwrap()).unwrap();
        assert_eq!(pet_display_name(&restored), "年糕");
    }
    #[test] fn unicode_names_are_bounded_and_invalid_names_rejected() {
        let mut prefs = Snapshot::default().preferences;
        prefs.pet_names.insert("doubao-static".into(), "🐾".repeat(24));
        assert!(valid_preferences(&prefs));
        for invalid in ["".into(), " ".into(), " 小团子".into(), "小\n团子".into(), "🐾".repeat(25)] {
            prefs.pet_names.insert("doubao-static".into(), invalid);
            assert!(!valid_preferences(&prefs));
        }
    }
    #[test] fn rejects_invalid_ambient_preferences_and_restores_valid_settings(){
        let mut s=Snapshot::default();s.preferences.ambient_frequency="unbounded".into();assert!(!valid_preferences(&s.preferences));
        s.preferences.ambient_frequency="low".into();s.preferences.ambient_range="screen".into();assert!(!valid_preferences(&s.preferences));
        s.preferences.ambient_range="medium".into();s.preferences.ambient_enabled=false;assert!(valid_preferences(&s.preferences));
        let restored:Snapshot=serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();assert!(!restored.preferences.ambient_enabled);assert_eq!(restored.preferences.ambient_range,"medium");
    }
}
