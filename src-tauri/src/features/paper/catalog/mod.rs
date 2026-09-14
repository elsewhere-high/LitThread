//! Vault paper catalog: `.litthread/catalog.sqlite`.
//!
//! Authoritative store for paper set + structured metadata; the tauri-free
//! body lives in `litthread_core::features::paper::catalog`.
//! See `source documentation`.

pub use litthread_core::features::paper::catalog::*;

#[cfg(feature = "desktop")]
pub mod commands;
