use tauri_plugin_notification::NotificationExt;

#[cfg(target_os = "windows")]
#[repr(C)]
struct LastInputInfo {
    cb_size: u32,
    dw_time: u32,
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    fn GetLastInputInfo(info: *mut LastInputInfo) -> i32;
}

#[cfg(target_os = "windows")]
#[link(name = "kernel32")]
extern "system" {
    fn GetTickCount() -> u32;
}

#[tauri::command]
fn show_checkin_notification(app: tauri::AppHandle) -> Result<(), String> {
    app.notification()
        .builder()
        .title("Check-in Time")
        .body("How is your brain right now?")
        .show()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn system_idle_ms() -> Result<u64, String> {
    #[cfg(target_os = "windows")]
    {
        let mut info = LastInputInfo {
            cb_size: std::mem::size_of::<LastInputInfo>() as u32,
            dw_time: 0,
        };
        let succeeded = unsafe { GetLastInputInfo(&mut info) };
        if succeeded == 0 {
            return Err("Windows could not read the last input time".into());
        }
        let now = unsafe { GetTickCount() };
        return Ok(now.wrapping_sub(info.dw_time) as u64);
    }

    #[cfg(not(target_os = "windows"))]
    Err("System-wide idle detection is only available on Windows".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![show_checkin_notification, system_idle_ms])
        .run(tauri::generate_context!())
        .expect("error while running DingDing Zones");
}
