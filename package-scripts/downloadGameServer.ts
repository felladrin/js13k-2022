import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import download from "download";

const serverFolder = resolve(__dirname, "..", "js13kserver");

if (existsSync(serverFolder)) process.exit();

(async () => {
  await download(
    "https://github.com/js13kGames/js13kserver/archive/63a3f1631aaad819d50b5f1b0478f26be3d4700a.zip",
    serverFolder,
    {
      extract: true,
      strip: 1,
    }
  );
  console.log("Finished downloading the game server.");
  execSync("npm ci", { cwd: serverFolder });
  console.log("Finished installing game server dependencies.");
})();
