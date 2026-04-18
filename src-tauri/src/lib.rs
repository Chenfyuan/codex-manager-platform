pub mod codex;
pub mod commands;
pub mod credentials;
pub mod db;
pub mod proxy;
pub mod state;

use rusqlite::Connection;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder, AboutMetadata, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

use codex::switcher;
use state::AppState;

const TRAY_ID: &str = "main-tray";

#[cfg(target_os = "windows")]
fn configure_windows_main_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        // The frontend renders a custom draggable title bar on Windows.
        window.set_decorations(false)?;
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn configure_windows_main_window(_: &AppHandle) -> tauri::Result<()> {
    Ok(())
}

pub fn rebuild_app_menu(app: &AppHandle) {
    let state = app.state::<AppState>();
    let accounts = state.accounts.lock().unwrap().clone();

    let active_id = {
        let current = std::fs::read_to_string(
            dirs::home_dir()
                .unwrap_or_default()
                .join(".codex")
                .join("auth.json"),
        )
        .unwrap_or_default();
        let conn = state.db.lock().unwrap();
        let mut found = None;
        for account in &accounts {
            if let Ok(cred) = db::get_credential(&conn, &account.id) {
                if cred.is_empty() { continue; }
                if switcher::is_oauth_credential(&cred) {
                    if cred.trim() == current.trim() { found = Some(account.id.clone()); break; }
                } else if current.contains(&cred) {
                    found = Some(account.id.clone()); break;
                }
            }
        }
        found
    };

    let icon_bytes = include_bytes!("../icons/128x128@2x.png");
    let about_icon = tauri::image::Image::from_bytes(icon_bytes).ok();

    let about_meta = AboutMetadata {
        name: Some("Codex 管理平台".into()),
        version: Some("0.1.2".into()),
        short_version: None,
        copyright: Some("Copyright © 2026".into()),
        credits: Some("一款纯 AI 字研的 Codex 账号管理平台".into()),
        icon: about_icon,
        ..Default::default()
    };

    let app_menu = {
        let mut b = SubmenuBuilder::new(app, "Codex 管理平台")
            .about(Some(about_meta));
        b = b.separator();
        if let Ok(item) = PredefinedMenuItem::hide(app, Some("隐藏 Codex 管理平台")) { b = b.item(&item); }
        if let Ok(item) = PredefinedMenuItem::hide_others(app, Some("隐藏其他")) { b = b.item(&item); }
        if let Ok(item) = PredefinedMenuItem::show_all(app, Some("全部显示")) { b = b.item(&item); }
        b = b.separator();
        if let Ok(item) = PredefinedMenuItem::quit(app, Some("退出 Codex 管理平台")) { b = b.item(&item); }
        b.build()
    };

    let edit_menu = {
        let mut b = SubmenuBuilder::new(app, "编辑");
        if let Ok(item) = PredefinedMenuItem::undo(app, Some("撤销")) { b = b.item(&item); }
        if let Ok(item) = PredefinedMenuItem::redo(app, Some("重做")) { b = b.item(&item); }
        b = b.separator();
        if let Ok(item) = PredefinedMenuItem::cut(app, Some("剪切")) { b = b.item(&item); }
        if let Ok(item) = PredefinedMenuItem::copy(app, Some("拷贝")) { b = b.item(&item); }
        if let Ok(item) = PredefinedMenuItem::paste(app, Some("粘贴")) { b = b.item(&item); }
        if let Ok(item) = PredefinedMenuItem::select_all(app, Some("全选")) { b = b.item(&item); }
        b.build()
    };

    let mut accounts_sub = SubmenuBuilder::new(app, "账号");
    let conn = state.db.lock().unwrap();
    for account in &accounts {
        let is_active = active_id.as_deref() == Some(&account.id);
        let prefix = if is_active { "✓ " } else { "   " };
        let quota_suffix = match db::get_latest_quota(&conn, &account.id) {
            Some(used) => {
                let remaining = (100.0 - used).max(0.0).round() as u32;
                format!(" ({}%)", remaining)
            }
            None => String::new(),
        };
        let label = format!("{}{}{}", prefix, account.name, quota_suffix);
        let id = format!("switch-{}", account.id);
        if let Ok(item) = MenuItemBuilder::new(label).id(id).build(app) {
            accounts_sub = accounts_sub.item(&item);
        }
    }
    drop(conn);
    if accounts.is_empty() {
        if let Ok(item) = MenuItemBuilder::new("暂无账号").id("noop").enabled(false).build(app) {
            accounts_sub = accounts_sub.item(&item);
        }
    }

    let view_menu_result = {
        let mut vm = SubmenuBuilder::new(app, "视图");
        if let Ok(item) = MenuItemBuilder::new("账号管理").id("view-dashboard").build(app) { vm = vm.item(&item); }
        if let Ok(item) = MenuItemBuilder::new("统计").id("view-stats").build(app) { vm = vm.item(&item); }
        if let Ok(item) = MenuItemBuilder::new("模板").id("view-prompts").build(app) { vm = vm.item(&item); }
        if let Ok(item) = MenuItemBuilder::new("历史").id("view-sessions").build(app) { vm = vm.item(&item); }
        if let Ok(item) = MenuItemBuilder::new("代理").id("view-proxy").build(app) { vm = vm.item(&item); }
        vm = vm.separator();
        if let Ok(item) = MenuItemBuilder::new("设置").id("view-settings").build(app) { vm = vm.item(&item); }
        vm.build()
    };

    let window_menu = {
        let mut b = SubmenuBuilder::new(app, "窗口");
        if let Ok(item) = PredefinedMenuItem::minimize(app, Some("最小化")) { b = b.item(&item); }
        if let Ok(item) = PredefinedMenuItem::maximize(app, Some("最大化")) { b = b.item(&item); }
        b = b.separator();
        if let Ok(item) = PredefinedMenuItem::close_window(app, Some("关闭窗口")) { b = b.item(&item); }
        b.build()
    };

    if let (Ok(app_m), Ok(edit_m), Ok(accounts_m), Ok(view_m), Ok(window_m)) =
        (app_menu, edit_menu, accounts_sub.build(), view_menu_result, window_menu)
    {
        if let Ok(menu) = MenuBuilder::new(app)
            .item(&app_m)
            .item(&edit_m)
            .item(&accounts_m)
            .item(&view_m)
            .item(&window_m)
            .build()
        {
            let _ = app.set_menu(menu);
        }
    }
}

pub fn rebuild_tray_menu(app: &AppHandle) {
    let state = app.state::<AppState>();
    let accounts = state.accounts.lock().unwrap().clone();

    let active_id = {
        let current = std::fs::read_to_string(
            dirs::home_dir()
                .unwrap_or_default()
                .join(".codex")
                .join("auth.json"),
        )
        .unwrap_or_default();

        let conn = state.db.lock().unwrap();
        let mut found = None;
        for account in &accounts {
            if let Ok(cred) = db::get_credential(&conn, &account.id) {
                if cred.is_empty() {
                    continue;
                }
                if switcher::is_oauth_credential(&cred) {
                    if cred.trim() == current.trim() {
                        found = Some(account.id.clone());
                        break;
                    }
                } else if current.contains(&cred) {
                    found = Some(account.id.clone());
                    break;
                }
            }
        }
        found
    };

    let mut builder = MenuBuilder::new(app);

    let conn = state.db.lock().unwrap();
    for account in &accounts {
        let is_active = active_id.as_deref() == Some(&account.id);
        let prefix = if is_active { "✓ " } else { "   " };
        let quota_suffix = match db::get_latest_quota(&conn, &account.id) {
            Some(used) => {
                let remaining = (100.0 - used).max(0.0).round() as u32;
                format!(" (剩余 {}%)", remaining)
            }
            None => String::new(),
        };
        let label = format!("{}{}{}", prefix, account.name, quota_suffix);
        let id = format!("switch-{}", account.id);
        if let Ok(item) = MenuItemBuilder::new(label).id(id).build(app) {
            builder = builder.item(&item);
        }
    }

    let has_providers: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM proxy_providers WHERE enabled = 1",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) > 0;
    drop(conn);

    if !accounts.is_empty() {
        builder = builder.separator();
    }

    let proxy_state = app.state::<commands::proxy::ProxyState>();
    let proxy_running = proxy_state.server.try_lock().map(|s| s.is_running()).unwrap_or(false);
    let proxy_label = if proxy_running { "✓ API 代理运行中" } else { "   启动 API 代理" };
    if let Ok(item) = MenuItemBuilder::new(proxy_label)
        .id("toggle-proxy")
        .enabled(has_providers || proxy_running)
        .build(app)
    {
        builder = builder.item(&item);
    }

    builder = builder.separator();

    if let Ok(show) = MenuItemBuilder::new("显示窗口").id("show").build(app) {
        builder = builder.item(&show);
    }
    builder = builder.separator();
    if let Ok(quit) = MenuItemBuilder::new("退出").id("quit").build(app) {
        builder = builder.item(&quit);
    }

    if let Ok(menu) = builder.build() {
        if let Some(tray) = app.tray_by_id(TRAY_ID) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
.plugin(tauri_plugin_shell::init())
.plugin(tauri_plugin_os::init())
.plugin(tauri_plugin_clipboard_manager::init())
.plugin(tauri_plugin_dialog::init())
.plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data dir");
            std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");

            let db_path = app_dir.join("codex-manager.db");
            let conn =
                Connection::open(&db_path).expect("Failed to open database");
            db::init(&conn).expect("Failed to init database");

            let accounts = db::load_all(&conn).unwrap_or_default();

            let state = AppState::new(conn);
            *state.accounts.lock().unwrap() = accounts;
            app.manage(state);
            app.manage(commands::proxy::ProxyState::new());
            configure_windows_main_window(app.handle())?;

            let show_item = MenuItemBuilder::new("显示窗口").id("show").build(app)?;
            let quit_item = MenuItemBuilder::new("退出").id("quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let tray_icon_rgba = include_bytes!("../icons/tray-icon.rgba");
            let tray_icon = tauri::image::Image::new(tray_icon_rgba, 44, 44);

            let _tray = TrayIconBuilder::<tauri::Wry>::with_id(TRAY_ID)
                .tooltip("Codex 管理平台")
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .build(app)?;

            let app_handle = app.handle().clone();
            app.on_menu_event(move |app, event| {
                let event_id = event.id().0.to_string();
                if event_id.starts_with("switch-") {
                    let account_id = event_id.strip_prefix("switch-").unwrap().to_string();
                    let state = app.state::<AppState>();
                    let conn = state.db.lock().unwrap();
                    if let Ok(cred) = db::get_credential(&conn, &account_id) {
                        drop(conn);
                        if !cred.is_empty() {
                            let write_ok = if switcher::is_oauth_credential(&cred) {
                                switcher::write_active_credential_raw(&cred).is_ok()
                            } else {
                                switcher::write_active_credential(&cred).is_ok()
                            };
                            if write_ok {
                                let conn = state.db.lock().unwrap();
                                let _ = db::update_last_active(&conn, &account_id);
                                drop(conn);

                                let mut accounts = state.accounts.lock().unwrap();
                                let now = chrono::Utc::now().to_rfc3339();
                                for a in accounts.iter_mut() {
                                    if a.id == account_id {
                                        a.last_active_at = Some(now.clone());
                                    }
                                }
                                drop(accounts);
                                rebuild_tray_menu(&app_handle);
                                rebuild_app_menu(&app_handle);

                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.emit("tray-account-switched", &account_id);
                                }
                            }
                        }
                    }
                } else {
                    match event_id.as_str() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        "toggle-proxy" => {
                            let proxy_state = app.state::<commands::proxy::ProxyState>();
                            let app_state = app.state::<AppState>();
                            let app_clone = app_handle.clone();
                            let server = std::sync::Arc::clone(&proxy_state.server);
                            let db_conn = app_state.db.lock().unwrap();

                            let providers_exist = db_conn
                                .query_row(
                                    "SELECT COUNT(*) FROM proxy_providers WHERE enabled = 1",
                                    [],
                                    |row| row.get::<_, i64>(0),
                                )
                                .unwrap_or(0) > 0;

                            let providers: Vec<crate::proxy::types::ProxyProvider> = if providers_exist {
                                let mut stmt = db_conn
                                    .prepare("SELECT id, name, provider_type, api_key, base_url, models_json, enabled FROM proxy_providers WHERE enabled = 1")
                                    .unwrap();
                                stmt.query_map([], |row| {
                                    let models_str: String = row.get(5)?;
                                    let models: Vec<crate::proxy::types::ModelMapping> =
                                        serde_json::from_str(&models_str).unwrap_or_default();
                                    Ok(crate::proxy::types::ProxyProvider {
                                        id: row.get(0)?,
                                        name: row.get(1)?,
                                        provider_type: row.get(2)?,
                                        api_key: row.get(3)?,
                                        base_url: row.get(4)?,
                                        models,
                                        enabled: row.get(6)?,
                                    })
                                })
                                .unwrap()
                                .filter_map(|r| r.ok())
                                .collect()
                            } else {
                                vec![]
                            };
                            drop(db_conn);

                            tauri::async_runtime::spawn(async move {
                                let mut srv = server.lock().await;
                                if srv.is_running() {
                                    srv.stop();
                                } else if !providers.is_empty() {
                                    srv.update_providers(providers).await;
                                    let _ = srv.start(0).await;
                                }
                                drop(srv);
                                rebuild_tray_menu(&app_clone);
                                if let Some(w) = app_clone.get_webview_window("main") {
                                    let _ = w.emit("proxy-toggled", ());
                                }
                            });
                        }
                        id if id.starts_with("view-") => {
                            let view = id.strip_prefix("view-").unwrap_or("dashboard");
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                                let _ = w.emit("menu-navigate", view);
                            }
                        }
                        _ => {}
                    }
                }
            });

            rebuild_tray_menu(app.handle());
            rebuild_app_menu(app.handle());

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();
                if label == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                } else if label == "spotlight" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::accounts::get_accounts,
            commands::accounts::add_account,
            commands::accounts::remove_account,
            commands::accounts::update_account_name,
            commands::accounts::update_account_credential,
            commands::accounts::update_account_tag,
            commands::accounts::get_all_tags,
            commands::accounts::update_model_preference,
            commands::accounts::import_account,
            commands::accounts::reorder_accounts,
            commands::threads::connect_account,
            commands::threads::disconnect_account,
            commands::threads::create_thread,
            commands::threads::get_threads,
            commands::threads::start_turn,
            commands::threads::interrupt_turn,
            commands::threads::get_thread_history,
            commands::threads::save_stream_item,
            commands::threads::fetch_account_info,
            commands::threads::fetch_rate_limits,
            commands::threads::fetch_model_list,
            commands::settings::detect_codex_cli,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::cleanup_old_data,
            commands::settings::get_db_size,
            commands::settings::get_quota_history_count,
            commands::settings::is_codex_running,
            commands::settings::get_codex_processes,
            commands::settings::get_account_launch_command,
            commands::settings::toggle_spotlight,
            commands::settings::hide_spotlight,
            commands::oauth::start_oauth_login,
            commands::oauth::check_oauth_status,
            commands::oauth::detect_existing_credentials,
            commands::oauth::refresh_oauth_token,
            commands::switcher::activate_account,
            commands::switcher::get_active_credential,
            commands::switcher::get_active_account_id,
            commands::switcher::check_quota,
            commands::switcher::check_all_quotas,
            commands::switcher::get_quota_history,
            commands::switcher::refresh_tray_menu,
            commands::switcher::get_today_switch_count,
            commands::switcher::get_daily_stats,
            commands::switcher::get_account_usage_summary,
            commands::switcher::get_hourly_activity,
            commands::switcher::get_consumption_rates,
            commands::backup::export_accounts,
            commands::backup::import_accounts_from_backup,
            commands::schedule::get_schedule_rules,
            commands::schedule::add_schedule_rule,
            commands::schedule::remove_schedule_rule,
            commands::schedule::update_account_priority,
            commands::schedule::get_recommended_account,
            commands::sessions::list_codex_sessions,
            commands::sessions::read_codex_session,
            commands::costs::fetch_openai_costs,
            commands::prompts::get_prompt_templates,
            commands::prompts::add_prompt_template,
            commands::prompts::update_prompt_template,
            commands::prompts::delete_prompt_template,
            commands::prompts::toggle_prompt_favorite,
            commands::prompts::increment_prompt_use_count,
            commands::prompts::get_prompt_categories,
            commands::proxy::proxy_start,
            commands::proxy::proxy_stop,
            commands::proxy::proxy_get_status,
            commands::proxy::proxy_get_logs,
            commands::proxy::proxy_get_providers,
            commands::proxy::proxy_add_provider,
            commands::proxy::proxy_update_provider,
            commands::proxy::proxy_remove_provider,
            commands::proxy::proxy_reload_providers,
            commands::proxy::proxy_fetch_remote_models,
            commands::oplog::get_operation_logs,
            commands::oplog::clear_operation_logs,
            commands::oplog::log_operation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
