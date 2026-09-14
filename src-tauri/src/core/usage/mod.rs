//! Desktop `#[tauri::command]` surface over `litthread_core::usage`.
//!
//! The storage / query / projection layer (tauri-free, shared with the
//! headless CLI) lives in `litthread_core::usage` and is glob-re-exported here
//! so `crate::core::usage::X` paths are unchanged; only the Tauri command
//! module stays in this crate.

pub use litthread_core::usage::*;

#[cfg(feature = "desktop")]
pub mod commands;
