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
const signalBridgePublishDirectory = path.join(root, "native", "CartCollect.SignalBridge", "publish", "win-x64");
const copyRetryDelaysMs = [0, 250, 500, 1_000, 2_000, 5_000, 10_000];

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function copyFileWithRetry(source, destination) {
  let lastError;
  for (const delayMs of copyRetryDelaysMs) {
    if (delayMs) await wait(delayMs);
    try {
      await fs.promises.copyFile(source, destination);
      return;
    } catch (error) {
      lastError = error;
      if (!["EBUSY", "EACCES", "EPERM"].includes(error?.code)) throw error;
    }
  }
  throw new Error(`Windows kept the freshly compiled signal bridge locked: ${lastError?.message || source}`);
}

async function copyDirectoryWithRetry(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryWithRetry(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await copyFileWithRetry(sourcePath, destinationPath);
    }
  }
}

async function copySignalBridgeIntoApp(context) {
  const destination = path.join(context.appOutDir, "resources", "signal-bridge");
  await copyDirectoryWithRetry(signalBridgePublishDirectory, destination);
}

function publishSignalBridge() {
  if (process.platform !== "win32") return;
  const project = path.join(root, "native", "CartCollect.SignalBridge", "CartCollect.SignalBridge.csproj");
  const result = spawnSync("dotnet", [
    "publish",
    project,
    "--configuration", "Release",
    "--runtime", "win-x64",
    "--self-contained", "true",
    "--output", signalBridgePublishDirectory,
    "--disable-build-servers",
    "--nologo"
  ], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Windows signal bridge compilation failed with exit code ${result.status}.`);
  if (!fs.existsSync(path.join(signalBridgePublishDirectory, "CartCollect.SignalBridge.exe"))) {
    throw new Error("Windows signal bridge publish did not produce CartCollect.SignalBridge.exe.");
  }
}

async function buildTarget(target, artifactName, targetOutput, extension) {
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
      afterPack: copySignalBridgeIntoApp,
      artifactName
    }
  });
  const artifacts = fs.readdirSync(targetOutput)
    .filter((name) => name.toLowerCase().endsWith(extension));
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
  publishSignalBridge();
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "cart-confirm-windows-"));
  let artifacts;
  try {
    const setup = await buildTarget(
      "nsis",
      "Cart-Confirm-Setup-${version}-${arch}.${ext}",
      path.join(staging, "setup"),
      ".exe"
    );
    const portable = await buildTarget(
      "portable",
      "Cart-Confirm-Portable-${version}-${arch}.${ext}",
      path.join(staging, "portable"),
      ".exe"
    );
    const signedPackageRequested = Boolean(process.env.CSC_LINK || process.env.WIN_CSC_LINK);
    const appx = signedPackageRequested
      ? await buildTarget(
          "appx",
          "Cart-Confirm-Signals-${version}-${arch}.${ext}",
          path.join(staging, "appx"),
          ".appx"
        )
      : null;
    fs.mkdirSync(output, { recursive: true });
    artifacts = [setup, portable, appx].filter(Boolean).map((source) => {
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
