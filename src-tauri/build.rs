fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_snapshot", "update_preferences", "timer_action", "add_pet", "remove_pet",
            "trigger_action", "begin_drag", "update_hit_regions", "desktop_action",
            "get_integrations", "update_integrations", "refresh_integrations", "set_deepseek_key", "demo_agent",
            "preview_ambient", "check_connections", "test_agent_connection",
            "update_inbox", "export_backup", "preview_backup", "restore_backup", "undo_restore", "backup_status",
            "get_system_status", "set_startup", "set_update_source", "check_update", "open_release_page",
            "set_automatic_updates", "download_update", "install_update",
            "update_price_rates",
        ])
    )).expect("failed to build desktop application");
}
