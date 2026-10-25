//! Closing the window quits the app, and quitting stops the server with the AI's work in it. The frontend says whether
//! the AI is at work (`quit_guard`); while it is, the window's close button does not close it but asks the frontend
//! (`quit-requested`), which asks the person and then quits (`quit`). The menu's 윈도우 닫기 and 끝내기 ask the same way
//! in the frontend. Quitting from outside the window (the Dock icon's 종료, logging out) asks the same way too.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, ExitRequestApi, Manager, Window, WindowEvent};

/// Whether the AI is at work, as the frontend last said.
#[derive(Default)]
pub struct Working(AtomicBool);

#[tauri::command]
pub fn quit_guard(working: bool, state: tauri::State<'_, Working>) {
    state.0.store(working, Ordering::Relaxed);
}

/// Quits now, without asking: the frontend asked already.
#[tauri::command]
pub fn quit(app: AppHandle) {
    app.exit(0);
}

/// The window's close button: while the AI works, the frontend asks first.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event
        && window.state::<Working>().0.load(Ordering::Relaxed)
    {
        api.prevent_close();
        let _ = window.emit("quit-requested", ());
    }
}

/// A quit that did not come from the frontend (the Dock icon's 종료, logging out or shutting down): while the AI works,
/// the frontend asks first, as for the close button. `quit` and a restart into an update carry an exit code and go on.
pub fn on_exit_requested(app: &AppHandle, code: Option<i32>, api: &ExitRequestApi) {
    if code.is_none() && app.state::<Working>().0.load(Ordering::Relaxed) {
        api.prevent_exit();
        let _ = app.emit("quit-requested", ());
    }
}
