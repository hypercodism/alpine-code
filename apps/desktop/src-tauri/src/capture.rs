//! Pictures of the project's running app for the AI (`screens/capture`, the `app_screen` tool): one screen opened out
//! of sight, in a window of its own that is never shown, read and photographed by WebKit, then closed. A window that is
//! never put on screen still draws, so nothing flashes in front of the person.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use base64::Engine;
use serde::Serialize;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, LogicalSize, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Serialize, Default)]
pub struct Capture {
    /// The screen as a PNG, base64.
    image: Option<String>,
    /// What the page says, as `READ` returns it (JSON text).
    read: Option<String>,
    error: Option<String>,
}

/// Before anything of the page runs: what goes wrong in it is kept, to be said with the screen.
/// What the app's own plugins say in this window (it has no permissions, so their scripts are refused) is not the page's.
const WATCH: &str = r#"(function(){var e=window.__alpineErrors=[];function add(t){t=String(t);if(/not allowed on window "capture-/.test(t))return;if(e.length<20)e.push(t.slice(0,500))}
addEventListener('error',function(x){add(x.message||x)});
addEventListener('unhandledrejection',function(x){add('Unhandled rejection: '+((x.reason&&x.reason.message)||x.reason))});
var c=console.error;console.error=function(){add(Array.prototype.map.call(arguments,String).join(' '));return c.apply(console,arguments)}})();"#;

/// What the screen says: its mark, title, words, buttons to other screens, promises and errors.
const READ: &str = r#"JSON.stringify((function(){
var root=document.querySelector('[data-alpine-screen]');
function label(el){return (el.innerText||el.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,60)}
return {screen:root&&root.getAttribute('data-alpine-screen'),title:document.title,
text:(document.body?document.body.innerText:'').replace(/\n{3,}/g,'\n\n').slice(0,6000),
targets:Array.prototype.map.call(document.querySelectorAll('[data-alpine-to]'),function(el){return {to:el.getAttribute('data-alpine-to'),label:label(el)}}),
promises:Array.prototype.map.call(document.querySelectorAll('[data-alpine-promise]'),function(el){return el.getAttribute('data-alpine-promise')}),
errors:window.__alpineErrors||[],href:location.pathname+location.search}})())"#;

/// The page's whole height, for a picture of all of it.
const HEIGHT: &str = r#"String(Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0))"#;

const MARKED: &str = r#"document.querySelector('[data-alpine-screen]')?'1':''"#;

/// The tallest picture taken of a whole page.
const TALLEST: f64 = 3000.0;

static NEXT: AtomicU32 = AtomicU32::new(0);

#[tauri::command]
pub async fn capture_screen(app: AppHandle, url: String, width: f64, height: f64, whole: bool) -> Capture {
    tauri::async_runtime::spawn_blocking(move || match capture(&app, &url, width, height, whole) {
        Ok(capture) => capture,
        Err(error) => Capture { error: Some(error), ..Capture::default() },
    })
    .await
    .unwrap_or_else(|error| Capture { error: Some(error.to_string()), ..Capture::default() })
}

fn capture(app: &AppHandle, url: &str, width: f64, height: f64, whole: bool) -> Result<Capture, String> {
    let address: Url = url.parse().map_err(|error| format!("Not an address: {error}"))?;
    if !matches!(address.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")) {
        return Err("Only the project's own app, on this computer, is opened".into());
    }
    let (loaded, on_load) = mpsc::channel();
    let label = format!("capture-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(address))
        .inner_size(width, height)
        .visible(false)
        .focused(false)
        .decorations(false)
        .initialization_script(WATCH)
        .on_page_load(move |_, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = loaded.send(());
            }
        })
        .build()
        .map_err(|error| error.to_string())?;
    let result = (|| {
        on_load.recv_timeout(Duration::from_secs(20)).map_err(|_| "The screen did not load in 20 seconds".to_string())?;
        // An app draws after it loads: wait for its screen's mark (up to a few seconds), then a moment for the rest.
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(8) && eval(&window, MARKED).unwrap_or_default().is_empty() {
            thread::sleep(Duration::from_millis(250));
        }
        thread::sleep(Duration::from_millis(500));
        if whole {
            let tall = eval(&window, HEIGHT)?.parse::<f64>().unwrap_or(height);
            if tall > height + 1.0 {
                window.set_size(LogicalSize::new(width, tall.min(TALLEST))).map_err(|error| error.to_string())?;
                thread::sleep(Duration::from_millis(400));
            }
        }
        let read = eval(&window, READ).ok();
        let image = snapshot(&window).ok().map(|png| base64::engine::general_purpose::STANDARD.encode(png));
        Ok(Capture { image, read, error: None })
    })();
    let _ = window.destroy();
    result
}

#[cfg(target_os = "macos")]
fn eval(window: &WebviewWindow, script: &str) -> Result<String, String> {
    use block2::RcBlock;
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSError, NSString};
    use objc2_web_kit::WKWebView;

    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    let script = script.to_string();
    window
        .with_webview(move |webview| unsafe {
            let view: &WKWebView = &*(webview.inner() as *const WKWebView);
            let source = NSString::from_str(&script);
            let block = RcBlock::new(move |result: *mut AnyObject, error: *mut NSError| {
                let text = if !error.is_null() {
                    Err((*error).localizedDescription().to_string())
                } else if result.is_null() {
                    Ok(String::new())
                } else {
                    Ok((*result).downcast_ref::<NSString>().map(|text| text.to_string()).unwrap_or_default())
                };
                let _ = tx.send(text);
            });
            view.evaluateJavaScript_completionHandler(&source, Some(&block));
        })
        .map_err(|error| error.to_string())?;
    rx.recv_timeout(Duration::from_secs(10)).map_err(|_| "The page did not answer".to_string())?
}

#[cfg(target_os = "macos")]
fn snapshot(window: &WebviewWindow) -> Result<Vec<u8>, String> {
    use block2::RcBlock;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
    use objc2_foundation::{NSDictionary, NSError};
    use objc2_web_kit::WKWebView;

    let (tx, rx) = mpsc::channel::<Result<Vec<u8>, String>>();
    window
        .with_webview(move |webview| unsafe {
            let view: &WKWebView = &*(webview.inner() as *const WKWebView);
            let block = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
                let png = if image.is_null() {
                    Err(if error.is_null() { "No picture".to_string() } else { (*error).localizedDescription().to_string() })
                } else {
                    (*image)
                        .TIFFRepresentation()
                        .and_then(|tiff| NSBitmapImageRep::imageRepWithData(&tiff))
                        .and_then(|rep| rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new()))
                        .map(|data| data.to_vec())
                        .ok_or_else(|| "The picture could not be made a PNG".to_string())
                };
                let _ = tx.send(png);
            });
            view.takeSnapshotWithConfiguration_completionHandler(None, &block);
        })
        .map_err(|error| error.to_string())?;
    rx.recv_timeout(Duration::from_secs(10)).map_err(|_| "No picture came".to_string())?
}

#[cfg(not(target_os = "macos"))]
fn eval(_: &WebviewWindow, _: &str) -> Result<String, String> {
    Err("Reading a screen works on macOS only for now".into())
}

#[cfg(not(target_os = "macos"))]
fn snapshot(_: &WebviewWindow) -> Result<Vec<u8>, String> {
    Err("Pictures of a screen work on macOS only for now".into())
}
