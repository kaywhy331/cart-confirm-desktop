"use strict";

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Arch, Platform, build } = require("electron-builder");
const packageJson = require("../package.json");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");

async function buildTarget(target, artifactName, targetOutput) {
  await build({
    projectDir: root,
    targets: Platform.WINDOWS.createTarget([target], Arch.x64),
    publish: "never",
    config: {
      ...packageJson.build,
      directories: {
        ...packageJson.build.directories,
        output: targetOutput
      },
      artifactName
    }
  });
  const artifacts = fs.readdirSync(targetOutput)
    .filter((name) => name.toLowerCase().endsWith(".exe"));
  if (artifacts.length !== 1) {
    throw new Error(`Expected exactly one ${target} executable, found ${artifacts.length}.`);
  }
  return path.join(targetOutput, artifacts[0]);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function main() {
  if (process.platform !== "win32") {
    const wine = spawnSync("wine", ["--version"], { stdio: "ignore" });
    if (wine.error?.code === "ENOENT" || wine.status !== 0) {
      throw new Error("Windows packaging on this host requires Wine; use the Windows CI packaging job instead.");
    }
  }
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "cart-confirm-windows-"));
  let artifacts;
  try {
    const setup = await buildTarget(
      "nsis",
      "Cart-Confirm-Setup-${version}-${arch}.${ext}",
      path.join(staging, "setup")
    );
    const portable = await buildTarget(
      "portable",
      "Cart-Confirm-Portable-${version}-${arch}.${ext}",
      path.join(staging, "portable")
    );
    fs.mkdirSync(output, { recursive: true });
    artifacts = [setup, portable].map((source) => {
      const name = path.basename(source);
      fs.copyFileSync(source, path.join(output, name));
      return name;
    }).sort();
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  const checksums = artifacts.map((name) => `${sha256(path.join(output, name))}  ${name}`).join("\n");
  fs.writeFileSync(path.join(output, "SHA256SUMS.txt"), `${checksums}\n`);
  console.log(`Built ${packageJson.name} ${packageJson.version}: ${artifacts.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
