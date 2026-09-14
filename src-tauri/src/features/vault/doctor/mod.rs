//! Read-only Vault diagnostics and conservative paper-alias / wikilink repair.
//!
//! Body in `litthread_core::features::vault::doctor`; desktop command shell here.

pub use litthread_core::features::vault::doctor::*;

#[cfg(feature = "desktop")]
pub mod commands;
