fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_snapshot", "update_preferences", "timer_action", "add_pet", "remove_pet",
            "trigger_action", "begin_drag", "update_hit_regions", "desktop_action",
        ])
    )).expect("failed to build desktop application");
}
