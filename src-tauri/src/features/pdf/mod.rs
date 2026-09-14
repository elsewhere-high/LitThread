//! PDF features.
//!
//! `locate` (quote → page rects + annotation store) and `marks` (reading
//! marks) are tauri-free and live in `litthread_core::features::pdf`; only the
//! desktop export shell stays here.

#[cfg(feature = "desktop")]
pub mod export;
#[cfg(not(any(target_os = "ios", target_os = "android")))]
pub use litthread_core::features::pdf::locate;
pub use litthread_core::features::pdf::marks;
