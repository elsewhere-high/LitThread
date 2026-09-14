//! Translation providers (free MT + LLM) shared by the Host and the CLI.
//!
//! Body in `litthread_core::features::translate`; desktop command shell here.

pub use litthread_core::features::translate::*;

#[cfg(feature = "desktop")]
pub mod commands;
