// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::WebviewWindowBuilder,
    Manager, WebviewUrl,
};
use tauri_plugin_positioner::{Position, WindowExt};
use tauri_plugin_shell::ShellExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            // ── 1. Hide dock icon (menu-bar-only app) ─────────────
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            // ── 2. Spawn the Express server ───────────────────────
            let shell = app.shell();
            let (mut rx, _child) = shell
                .command("npx")
                .args(["tsx", "server/index.ts"])
                .spawn()
                .expect("Failed to spawn Express server");

            // Log server output in background
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            print!("{}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprint!("{}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Terminated(status) => {
                            eprintln!("Express server exited: {:?}", status);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            // ── 3. Build system tray icon ─────────────────────────
            let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))
                .expect("Failed to load tray icon");

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .icon_as_template(true) // macOS: monochrome in menu bar
                .tooltip("ReelForge")
                .on_tray_icon_event(|tray, event| {
                    // Let positioner track tray position
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);

                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();

                        if let Some(window) = app.get_webview_window("main") {
                            // Toggle: if visible, hide; if hidden, show
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.move_window(Position::TrayCenter);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        } else {
                            // First click: create the window
                            let url = "http://localhost:3100".parse().unwrap();
                            let win = WebviewWindowBuilder::new(
                                app,
                                "main",
                                WebviewUrl::External(url),
                            )
                            .title("ReelForge")
                            .inner_size(400.0, 640.0)
                            .decorations(false)
                            .resizable(false)
                            .skip_taskbar(true)
                            .always_on_top(true)
                            .visible(false)
                            .build()
                            .expect("Failed to create window");

                            let _ = win.move_window(Position::TrayCenter);
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
