import { spawn } from "node:child_process";
import path from "node:path";
import { configureRustToolchain, projectRoot } from "./toolchain.mjs";

configureRustToolchain();
const [tool, ...args] = process.argv.slice(2);
if (tool !== "tauri" && tool !== "cargo")
	throw new Error("Expected tauri or cargo");
const command = tool === "tauri" ? process.execPath : "cargo";
const argv =
	tool === "tauri"
		? [path.join(projectRoot, "node_modules/@tauri-apps/cli/tauri.js"), ...args]
		: args;
const child = spawn(command, argv, {
	cwd: projectRoot,
	stdio: "inherit",
	env: process.env,
});
child.on("error", (error) => {
	console.error(error.message);
	process.exitCode = 1;
});
child.on("exit", (code, signal) => {
	if (signal) process.kill(process.pid, signal);
	else process.exitCode = code ?? 1;
});
