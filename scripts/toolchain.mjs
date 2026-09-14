import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);

/** Prefer the project-local Rust installation; otherwise use the caller's toolchain. */
export function configureRustToolchain() {
	if (process.platform === "darwin" && !process.env.MACOSX_DEPLOYMENT_TARGET)
		process.env.MACOSX_DEPLOYMENT_TARGET = "12.0";
	const base = path.join(projectRoot, ".toolchains");
	const cargoHome = path.join(base, "cargo");
	if (
		fs.existsSync(
			path.join(
				cargoHome,
				"bin",
				process.platform === "win32" ? "cargo.exe" : "cargo",
			),
		)
	) {
		process.env.CARGO_HOME = cargoHome;
		process.env.RUSTUP_HOME = path.join(base, "rustup");
		process.env.PATH = `${path.join(cargoHome, "bin")}${path.delimiter}${process.env.PATH ?? ""}`;
	}
}
