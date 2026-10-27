//! The 문서 taken out of the app (`documentPage` / `documentMarkdown` on the page side): Markdown written where the
//! person chose, a PDF printed from the document's own page in a window that is never shown (WebKit's printing, so the
//! pages break as print type does), and the Mac's share menu over a PDF, to send it by mail, Messages or AirDrop.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::capture::eval;

static NEXT: AtomicU32 = AtomicU32::new(0);

/// The page is drawn, its pictures included.
const READY: &str = r#"document.readyState==='complete'&&!!document.querySelector('header h1')&&Array.prototype.every.call(document.images,function(i){return i.complete})?'1':''"#;

/// An A4 page in points, and the page's width in CSS pixels it is laid out at.
const A4: (f64, f64) = (595.28, 841.89);
const PAGE_WIDTH: f64 = 794.0;

fn ends_with(path: &Path, extension: &str) -> Result<(), String> {
    match path.extension().and_then(|one| one.to_str()) {
        Some(one) if one.eq_ignore_ascii_case(extension) => Ok(()),
        _ => Err(format!("Only a .{extension} file is written here")),
    }
}

#[tauri::command]
pub fn save_text(path: String, text: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    ends_with(&path, "md")?;
    std::fs::write(&path, text).map_err(|error| error.to_string())
}

/// Prints the page to a PDF at `path`, or, without one, to a file of its own in the temporary folder (for sharing).
/// Answers where the PDF is.
#[tauri::command]
pub async fn save_pdf(app: AppHandle, html: String, path: Option<String>, name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = match path {
            Some(path) => PathBuf::from(path),
            None => {
                let folder = std::env::temp_dir().join("AlpineCode");
                std::fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
                let safe: String = name.chars().map(|c| if "/\\:".contains(c) { '-' } else { c }).collect();
                folder.join(format!("{safe}.pdf"))
            }
        };
        ends_with(&path, "pdf")?;
        print(&app, &html, &path)?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn print(app: &AppHandle, html: &str, path: &Path) -> Result<(), String> {
    // The file the print writes is watched for: one there before would look done at once.
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    let label = format!("export-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    // An empty window (a blank page says nothing when it loads), given the document's page as soon as it is there.
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::External("about:blank".parse().unwrap()))
        .inner_size(PAGE_WIDTH, A4.1 * PAGE_WIDTH / A4.0)
        .visible(false)
        .focused(false)
        .decorations(false)
        .build()
        .map_err(|error| error.to_string())?;
    let result = (|| {
        load_html(&window, html)?;
        let start = Instant::now();
        let mut loaded = Instant::now();
        while eval(&window, READY).unwrap_or_default().is_empty() {
            if start.elapsed() > Duration::from_secs(20) {
                return Err("The document did not draw in 20 seconds".into());
            }
            // The blank page the window opened with can land after the document and wipe it: given again.
            if loaded.elapsed() > Duration::from_secs(3) {
                load_html(&window, html)?;
                loaded = Instant::now();
            }
            thread::sleep(Duration::from_millis(200));
        }
        start_print(&window, path)?;
        // The print writes the file on its own; it is done once the file stops growing.
        let start = Instant::now();
        let mut last = 0;
        loop {
            thread::sleep(Duration::from_millis(400));
            let size = std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0);
            if size > 0 && size == last {
                return Ok(());
            }
            last = size;
            if start.elapsed() > Duration::from_secs(60) {
                return Err("The PDF was not written in a minute".into());
            }
        }
    })();
    let _ = window.destroy();
    result
}

#[cfg(target_os = "macos")]
fn load_html(window: &WebviewWindow, html: &str) -> Result<(), String> {
    use objc2_foundation::NSString;
    use objc2_web_kit::WKWebView;

    let html = html.to_string();
    window
        .with_webview(move |webview| unsafe {
            let view: &WKWebView = &*(webview.inner() as *const WKWebView);
            view.loadHTMLString_baseURL(&NSString::from_str(&html), None);
        })
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn start_print(window: &WebviewWindow, path: &Path) -> Result<(), String> {
    use objc2::runtime::AnyObject;
    use objc2::AllocAnyThread;
    use objc2_app_kit::{NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob};
    use objc2_foundation::{NSSize, NSString, NSURL};
    use objc2_web_kit::WKWebView;

    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let path = path.to_string_lossy().into_owned();
    window
        .with_webview(move |webview| unsafe {
            let view: &WKWebView = &*(webview.inner() as *const WKWebView);
            // A print info of its own, so the app's shared one is left as it was.
            let info = NSPrintInfo::initWithDictionary(NSPrintInfo::alloc(), &NSPrintInfo::sharedPrintInfo().dictionary());
            info.setPaperSize(NSSize::new(A4.0, A4.1));
            info.setTopMargin(42.0);
            info.setBottomMargin(42.0);
            info.setLeftMargin(40.0);
            info.setRightMargin(40.0);
            info.setVerticallyCentered(false);
            info.setJobDisposition(NSPrintSaveJob);
            let url = NSURL::fileURLWithPath(&NSString::from_str(&path));
            let url: &AnyObject = &url;
            info.dictionary().insert(NSPrintJobSavingURL, url);
            let operation = view.printOperationWithPrintInfo(&info);
            operation.setShowsPrintPanel(false);
            operation.setShowsProgressPanel(false);
            // WebKit draws nothing into a print whose view has no size.
            if let Some(printed) = operation.view() {
                printed.setFrame(view.bounds());
            }
            let Some(host) = view.window() else {
                let _ = tx.send(Err("The page has no window to print from".into()));
                return;
            };
            operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
                &host,
                None,
                None,
                std::ptr::null_mut(),
            );
            let _ = tx.send(Ok(()));
        })
        .map_err(|error| error.to_string())?;
    rx.recv_timeout(Duration::from_secs(10)).map_err(|_| "The print did not start".to_string())?
}

#[cfg(target_os = "macos")]
thread_local! {
    /// The share menu on view: it closes itself, but must live until it does.
    static PICKER: std::cell::RefCell<Option<objc2::rc::Retained<objc2_app_kit::NSSharingServicePicker>>> =
        const { std::cell::RefCell::new(None) };
}

/// Opens the Mac's share menu for the file at `path`, under the button at (`x`, `y`, `width`, `height`) of the window.
#[tauri::command]
pub fn share_file(app: AppHandle, path: String, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("No main window")?;
    share(&window, path, x, y, width, height)
}

#[cfg(target_os = "macos")]
fn share(window: &WebviewWindow, path: String, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    use objc2::runtime::AnyObject;
    use objc2::AllocAnyThread;
    use objc2_app_kit::{NSSharingServicePicker, NSView};
    use objc2_foundation::{NSArray, NSPoint, NSRect, NSRectEdge, NSSize, NSString, NSURL};

    window
        .with_webview(move |webview| unsafe {
            let view: &NSView = &*(webview.inner() as *const NSView);
            let url = NSURL::fileURLWithPath(&NSString::from_str(&path));
            let item: &AnyObject = &url;
            let picker = NSSharingServicePicker::initWithItems(NSSharingServicePicker::alloc(), &NSArray::from_slice(&[item]));
            // The page's view counts from its top, as the page does.
            let rect = NSRect::new(NSPoint::new(x, y), NSSize::new(width, height));
            picker.showRelativeToRect_ofView_preferredEdge(rect, view, NSRectEdge::MaxY);
            PICKER.with(|slot| *slot.borrow_mut() = Some(picker));
        })
        .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "macos"))]
fn load_html(_: &WebviewWindow, _: &str) -> Result<(), String> {
    Err("PDFs are made on macOS only for now".into())
}

#[cfg(not(target_os = "macos"))]
fn start_print(_: &WebviewWindow, _: &Path) -> Result<(), String> {
    Err("PDFs are made on macOS only for now".into())
}

#[cfg(not(target_os = "macos"))]
fn share(_: &WebviewWindow, _: String, _: f64, _: f64, _: f64, _: f64) -> Result<(), String> {
    Err("Sharing works on macOS only for now".into())
}
