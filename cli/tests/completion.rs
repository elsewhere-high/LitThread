//! Shell completion generation / install.

use assert_cmd::cargo::cargo_bin_cmd;
use predicates::prelude::*;
use serde_json::Value;
use std::fs;
use tempfile::tempdir;

fn litthread() -> assert_cmd::Command {
    cargo_bin_cmd!("litthread-cli")
}

#[test]
fn completion_zsh_prints_raw_script() {
    let out = litthread()
        .args(["completion", "zsh", "--bin-name", "litthread"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let script = String::from_utf8(out).unwrap();
    assert!(
        script.contains("#compdef litthread") || script.contains("compdef litthread"),
        "zsh script should define litthread:\n{script}"
    );
    assert!(
        !script.contains("\"ok\""),
        "completion stdout must stay a raw script, not a JSON envelope"
    );
}

#[test]
fn completion_bash_lists_subcommands() {
    let out = litthread()
        .args(["completion", "bash", "--bin-name", "litthread"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let script = String::from_utf8(out).unwrap();
    assert!(script.contains("paper"));
    assert!(script.contains("vault"));
    assert!(script.contains("completion"));
}

#[test]
fn completion_json_flag_still_prints_raw_script() {
    let out = litthread()
        .args(["--json", "completion", "fish", "--bin-name", "litthread"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let script = String::from_utf8(out).unwrap();
    assert!(script.contains("complete") || script.contains("litthread"));
    assert!(!script.trim_start().starts_with('{'));
}

#[test]
fn completion_unknown_shell_fails() {
    litthread()
        .args(["completion", "noshell"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("bash").or(predicate::str::contains("invalid")));
}

#[test]
fn completion_install_bash_writes_xdg_file() {
    let tmp = tempdir().unwrap();
    let home = tmp.path();
    let data = home.join("share");
    let out = litthread()
        .env("HOME", home)
        .env("XDG_DATA_HOME", &data)
        .args([
            "completion",
            "bash",
            "--install",
            "--bin-name",
            "litthread",
            "--json",
        ])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let v: Value = serde_json::from_slice(&out).unwrap();
    assert_eq!(v["ok"], true);
    assert_eq!(v["data"]["shell"], "bash");
    assert_eq!(v["data"]["binName"], "litthread");
    let path = v["data"]["path"].as_str().unwrap();
    assert!(path.ends_with("bash-completion/completions/litthread"));
    let script = fs::read_to_string(path).unwrap();
    assert!(script.contains("litthread"));
}

#[test]
fn help_lists_completion() {
    litthread()
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("completion"));
}
