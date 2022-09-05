import { resolve } from "node:path";
import { createWriteStream, statSync } from "node:fs";
import { EOL } from "node:os";
import archiver from "archiver";
import tasuku from "tasuku";
import { greenBright, redBright } from "colorette";
// @ts-ignore
import crossExecFile from "cross-exec-file";
// @ts-ignore
import efficientCompressionTool from "ect-bin";
// @ts-ignore
import zipstats from "zipstats";

const publicFolderPath = resolve(__dirname, "..", "js13kserver", "public");
const zipFilePath = resolve(__dirname, "..", "game.zip");
const archive = archiver("zip", { zlib: { level: 9 } });

tasuku.group((task) => [
  task("Creating zip file", async () => {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipFilePath);
      output.on("close", resolve);
      output.on("error", reject);
      archive.pipe(output);
      archive.directory(publicFolderPath, "");
      archive.finalize();
    });
  }),
  task("Optimizing zip file", async ({ setOutput, setError }) => {
    const result: { stdout: string; stderr: string } = await crossExecFile(efficientCompressionTool, [
      "-9",
      "-zip",
      zipFilePath,
    ]);

    if (result.stderr.length) {
      setError(result.stderr);
    } else {
      setOutput(result.stdout);
    }
  }),
  task("Checking zip file", async ({ setOutput }) => {
    setOutput(zipstats(zipFilePath));
  }),
  task("Checking size limit", async ({ setOutput, setError }) => {
    const maxSizeAllowed = 13 * 1024;
    const fileSize = statSync(zipFilePath).size;
    const fileSizeDifference = Math.abs(maxSizeAllowed - fileSize);
    const isUnderSizeLimit = fileSize <= maxSizeAllowed;
    const message = `${fileSizeDifference} bytes ${isUnderSizeLimit ? "under" : "over"} the 13KB limit!${EOL}`;

    if (isUnderSizeLimit) {
      setOutput(greenBright(message));
    } else {
      setError(redBright(message));
    }
  }),
]);
