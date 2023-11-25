import { readdirSync } from "fs";
import { mkdtemp, rm, rmdir } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import puppeteer from "puppeteer-core";
import tar from "tar";
import config from "./config.json";
import { asyncDelay } from "./lib/util/async";

const main = async () => {
  const { brave } = config;

  const profileDir = await mkdtemp(path.join(tmpdir(), "brave-"));

  try {
    const browser = await puppeteer.launch({
      executablePath: brave.executablePath,
      userDataDir: profileDir,
      headless: false,
    });

    await new Promise<void>((resolve) => {
      console.log("Waiting for browser close...");

      browser.on("disconnected", () => {
        resolve();
      });
    });

    await asyncDelay(3_000);

    console.log("creating tar...");
    await tar.create(
      {
        gzip: true,
        cwd: profileDir,
        file: "bx-profile.tgz",
      },
      readdirSync(profileDir).map((filename) => {
        console.log(filename);
        return filename;
      })
    );
    console.log("done!");
  } finally {
    await rm(profileDir, { recursive: true, force: true });
  }
};

main();
