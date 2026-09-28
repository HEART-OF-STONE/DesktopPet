use crate::*;
use tauri::{menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem}, tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent}};

#[derive(Clone, Debug, PartialEq, Eq)]
struct Presentation {
    visibility_action: &'static str,
    quiet: bool,
    avoided: bool,
    tooltip: String,
}
impl Presentation {
    fn from_snapshot(snapshot: &Snapshot, avoided: bool) -> Self {
        let p = &snapshot.preferences;
        let avoided = p.pet_visible && p.avoid_fullscreen && avoided;
        let mut tooltip = format!("桌边 · {}", pet_display_name(snapshot));
        if !p.pet_visible { tooltip.push_str("\n宠物已隐藏"); }
        else if avoided { tooltip.push_str("\n全屏避让中，退出全屏后恢复"); }
        if p.quiet { tooltip.push_str("\n免打扰中"); }
        Self { visibility_action: if p.pet_visible { "隐藏宠物" } else { "显示宠物" }, quiet: p.quiet, avoided, tooltip }
    }
}

struct TrayState { icon: TrayIcon, presentation: Mutex<Presentation> }

fn menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>, view: &Presentation) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;
    if view.avoided {
        menu.append(&MenuItem::with_id(app, "tray-status", "全屏避让中，退出全屏后恢复", false, None::<&str>)?)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    menu.append_items(&[
        &MenuItem::with_id(app, "show", view.visibility_action, true, None::<&str>)?,
        &MenuItem::with_id(app, "reset", "找回宠物", true, None::<&str>)?,
        &CheckMenuItem::with_id(app, "quiet", "免打扰", true, view.quiet, None::<&str>)?,
        &PredefinedMenuItem::separator(app)?,
        &MenuItem::with_id(app, "settings", "打开管理面板", true, None::<&str>)?,
        &PredefinedMenuItem::separator(app)?,
        &MenuItem::with_id(app, "quit", "退出桌边", true, None::<&str>)?,
    ])?;
    Ok(menu)
}

fn current(app: &tauri::AppHandle) -> Result<Presentation, String> {
    let runtime = app.state::<Runtime>();
    let snapshot = runtime.data.lock().map_err(|_| "状态暂时不可用")?.clone();
    let avoided = *runtime.avoided.lock().map_err(|_| "避让状态不可用")?;
    Ok(Presentation::from_snapshot(&snapshot, avoided))
}

pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let view = current(app)?;
    let icon = TrayIconBuilder::with_id("desktop-pet")
        .icon(app.default_window_icon().ok_or("托盘图标缺失")?.clone())
        .tooltip(&view.tooltip).menu(&menu(app, &view)?).show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let result = match event.id.as_ref() {
                "show" => {
                    let visible = app.state::<Runtime>().data.lock().unwrap().preferences.pet_visible;
                    update_preferences(app.clone(), json!({"petVisible": !visible})).map(|_| ())
                },
                "quiet" => {
                    let quiet = app.state::<Runtime>().data.lock().unwrap().preferences.quiet;
                    update_preferences(app.clone(), json!({"quiet": !quiet})).map(|_| ())
                },
                "settings" => { show_main(app); Ok(()) },
                "reset" => desktop_action(app.clone(), "reset-position".into()),
                "quit" => { app.exit(0); Ok(()) },
                _ => return,
            };
            // Native check items toggle before their callback. Restore the saved
            // state even if persistence failed, rather than leaving a false check.
            if let Err(error) = result { eprintln!("托盘操作失败：{error}"); }
            sync_inner(app, true);
        })
        .on_tray_icon_event(|icon, event| {
            if matches!(event, TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. }) {
                show_main(icon.app_handle());
            }
        }).build(app)?;
    app.manage(TrayState { icon, presentation: Mutex::new(view) });
    Ok(())
}

pub fn sync(app: &tauri::AppHandle) { sync_inner(app, false); }
fn sync_inner(app: &tauri::AppHandle, force: bool) {
    if app.try_state::<TrayState>().is_none() { return; }
    let handle = app.clone();
    // Read the latest state on the UI thread, after caller locks are released.
    // This prevents stale queued updates and blocking menu calls under data locks.
    let _ = app.run_on_main_thread(move || {
        let Some(tray) = handle.try_state::<TrayState>() else { return; };
        let Ok(next) = current(&handle) else { return; };
        let Ok(mut previous) = tray.presentation.lock() else { return; };
        if !force && *previous == next { return; }
        let result = menu(&handle, &next).and_then(|menu| tray.icon.set_menu(Some(menu)))
            .and_then(|_| tray.icon.set_tooltip(Some(&next.tooltip)));
        if result.is_ok() { *previous = next; }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tray_separates_manual_visibility_from_fullscreen_avoidance() {
        for visible in [false, true] { for quiet in [false, true] { for avoided in [false, true] {
            let mut s = Snapshot::default(); s.preferences.pet_visible = visible; s.preferences.quiet = quiet;
            let view = Presentation::from_snapshot(&s, avoided);
            assert_eq!(view.visibility_action, if visible { "隐藏宠物" } else { "显示宠物" });
            assert_eq!(view.quiet, quiet);
            assert_eq!(view.avoided, visible && avoided);
            assert_eq!(view.tooltip.contains("宠物已隐藏"), !visible);
            assert_eq!(view.tooltip.contains("免打扰中"), quiet);
            assert_eq!(view.tooltip.contains("退出全屏后恢复"), visible && avoided);
        }}}
        let mut s = Snapshot::default(); s.preferences.avoid_fullscreen = false;
        assert!(!Presentation::from_snapshot(&s, true).avoided);
    }
    #[test]
    fn tooltip_follows_names_and_restored_preferences() {
        let mut s = Snapshot::default();
        s.preferences.pet_default_names.insert("doubao-static".into(), "小米".into());
        assert_eq!(Presentation::from_snapshot(&s, false).tooltip, "桌边 · 小米");
        s.preferences.pet_names.insert("doubao-static".into(), "团子".into());
        s.preferences.quiet = true; s.preferences.pet_visible = false;
        let restored: Snapshot = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap();
        assert_eq!(Presentation::from_snapshot(&restored, false).tooltip, "桌边 · 团子\n宠物已隐藏\n免打扰中");
    }
    #[test]
    fn native_menu_exposes_actions_checks_and_disabled_avoidance_notice() {
        let app = tauri::test::mock_builder().build(tauri::test::mock_context(tauri::test::noop_assets())).unwrap();
        let mut snapshot = Snapshot::default();
        for avoided in [false, true] {
            snapshot.preferences.quiet = avoided;
            let native_menu = menu(app.handle(), &Presentation::from_snapshot(&snapshot, avoided)).unwrap();
            let items = native_menu.items().unwrap();
            let offset = if avoided { 2 } else { 0 };
            assert_eq!(items.len(), 7 + offset);
            if avoided {
                let notice = items[0].as_menuitem().unwrap();
                assert!(!notice.is_enabled().unwrap());
                assert_eq!(notice.text().unwrap(), "全屏避让中，退出全屏后恢复");
            }
            assert_eq!(items[offset].as_menuitem().unwrap().text().unwrap(), "隐藏宠物");
            assert_eq!(items[offset+1].as_menuitem().unwrap().text().unwrap(), "找回宠物");
            assert_eq!(items[offset+2].as_check_menuitem().unwrap().is_checked().unwrap(), avoided);
            assert!(matches!(items[offset+3], tauri::menu::MenuItemKind::Predefined(_)));
            assert_eq!(items[offset+4].as_menuitem().unwrap().text().unwrap(), "打开管理面板");
            assert!(matches!(items[offset+5], tauri::menu::MenuItemKind::Predefined(_)));
            assert_eq!(items[offset+6].as_menuitem().unwrap().text().unwrap(), "退出桌边");
        }
    }
}
