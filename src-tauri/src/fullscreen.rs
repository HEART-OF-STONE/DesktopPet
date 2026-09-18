use crate::*;

fn covers(window:(i32,i32,i32,i32),screen:(i32,i32,i32,i32),caption:bool)->bool{
    !caption&&window.0<=screen.0+2&&window.1<=screen.1+2&&window.2>=screen.2-2&&window.3>=screen.3-2
}
fn active(app:&tauri::AppHandle)->bool{
    #[cfg(windows)] unsafe {
        use windows_sys::Win32::UI::WindowsAndMessaging::*;
        let foreground=GetForegroundWindow();if foreground.is_null()||IsIconic(foreground)!=0||IsWindowVisible(foreground)==0{return false;}
        let Some(pet)=app.get_webview_window("pet") else{return false;};
        if pet.hwnd().is_ok_and(|h|h.0==foreground){return false;}
        let mut name=[0u16;128];let len=GetClassNameW(foreground,name.as_mut_ptr(),128);
        let class=String::from_utf16_lossy(&name[..len.max(0) as usize]);
        if ["Progman","WorkerW","Shell_TrayWnd","Shell_SecondaryTrayWnd"].contains(&class.as_str()){return false;}
        let Ok(monitor)=placement_monitor(app,false) else{return false;};let p=monitor.position();let s=monitor.size();
        let mut rect=std::mem::zeroed();if GetWindowRect(foreground,&mut rect)==0{return false;}
        covers((rect.left,rect.top,rect.right,rect.bottom),(p.x,p.y,p.x+s.width as i32,p.y+s.height as i32),GetWindowLongW(foreground,GWL_STYLE) as u32&WS_CAPTION!=0)
    }
    #[cfg(not(windows))] {let _=app;false}
}
fn visibility(wanted:bool,enabled:bool,full:bool)->(bool,bool){let avoided=wanted&&enabled&&full;(wanted&&!avoided,avoided)}
pub fn sync_visibility(app:&tauri::AppHandle)->Result<(),String>{
    let runtime=app.state::<Runtime>();
    let (wanted,enabled)={let data=runtime.data.lock().map_err(|_|"设置不可用")?;(data.preferences.pet_visible,data.preferences.avoid_fullscreen)};
    let (visible,avoided)=visibility(wanted,enabled,enabled&&wanted&&active(app));
    let mut state=runtime.avoided.lock().map_err(|_|"避让状态不可用")?;
    // Repeat only while hidden so a renderer that subscribes after startup learns the state.
    if *state!=avoided||avoided{*state=avoided;app.emit("pet-fullscreen-avoid",avoided).map_err(|e|e.to_string())?;}
    if let Some(pet)=app.get_webview_window("pet"){
        if pet.is_visible().map_err(|e|e.to_string())?!=visible{
            if visible{pet.show()}else{pet.hide()}.map_err(|e|e.to_string())?;
        }
    }
    Ok(())
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn fullscreen_does_not_include_maximized_or_other_screen(){
        assert!(covers((0,0,1920,1080),(0,0,1920,1080),false));
        assert!(!covers((0,0,1920,1040),(0,0,1920,1080),false));
        assert!(!covers((-8,-8,1928,1088),(0,0,1920,1080),true));
        assert!(!covers((1920,0,3840,1080),(0,0,1920,1080),false));
        assert!(covers((-3840,0,0,2160),(-3840,0,0,2160),false));
    }
    #[test]fn temporary_avoidance_never_overrides_manual_hide(){
        assert_eq!(visibility(true,true,true),(false,true));
        assert_eq!(visibility(true,true,false),(true,false));
        assert_eq!(visibility(false,true,false),(false,false));
        assert_eq!(visibility(false,true,true),(false,false));
        assert_eq!(visibility(true,false,true),(true,false));
    }
}
