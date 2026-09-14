//! Cross-cutting foundations shared by Host features and the headless CLI.
//!
//! Tauri-independent foundations live in the `litthread-core` crate and are
//! re-exported here so `crate::core::X` paths stay stable (the CLI depends on
//! `litthread-core` directly). Modules kept in this crate:
//!
//! - [`app_handle`]: re-export bridge around `litthread_core::app_handle`
//!   (tauri-free [`AppHandle`](app_handle::AppHandle) / `HostHooks`); the
//!   desktop `TauriHostHooks` implementation lives in `features::host_hooks`
//!   to keep `core/` free of `features/` deps.
//! - [`telemetry`]: PostHog sender — `posthog-rs` (desktop-only optional dep)
//!   plus `tauri::VERSION` in the payload.
//! - [`usage::commands`]: `#[tauri::command]` surface over the tauri-free
//!   storage layer in `litthread_core::usage`.

pub mod app_handle;
#[cfg(all(
    feature = "desktop",
    not(any(target_os = "android", target_os = "ios"))
))]
pub mod telemetry;
pub mod usage;

pub use litthread_core::blocking;
pub use litthread_core::cancel;
pub use litthread_core::error;
pub use litthread_core::frontmatter;
pub use litthread_core::fs;
pub use litthread_core::http;
pub use litthread_core::install_dirs;
pub use litthread_core::json;
pub use litthread_core::log_util;
pub use litthread_core::paths;
pub use litthread_core::process;
pub use litthread_core::remote;
pub use litthread_core::sqlite;
pub use litthread_core::time;
