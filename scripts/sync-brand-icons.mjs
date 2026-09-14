import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "./toolchain.mjs";

const icons = path.join(projectRoot, "src-tauri/icons");
const gen = path.join(projectRoot, "src-tauri/gen");
const apple = path.join(gen, "apple/Assets.xcassets/AppIcon.appiconset");
if (fs.existsSync(apple)) {
	for (const file of fs.readdirSync(path.join(icons, "ios"))) {
		if (file.endsWith(".png"))
			fs.copyFileSync(path.join(icons, "ios", file), path.join(apple, file));
	}
}
const android = path.join(gen, "android/app/src/main/res");
if (fs.existsSync(android)) {
	for (const dir of fs.readdirSync(path.join(icons, "android"))) {
		if (!dir.startsWith("mipmap-")) continue;
		fs.cpSync(path.join(icons, "android", dir), path.join(android, dir), {
			recursive: true,
		});
	}
}
console.log("LitThread icons synchronized to native shells.");
