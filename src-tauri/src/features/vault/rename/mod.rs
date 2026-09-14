//! Coordinated Vault rename (folder/heading rename across wiki links).
//!
//! Body in `litthread_core::features::vault::rename`; desktop command shell here.

pub use litthread_core::features::vault::rename::*;

#[cfg(feature = "desktop")]
pub mod commands;
