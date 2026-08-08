"use strict";

const fs = require("node:fs");
const path = require("node:path");

// The companion extension only exists inside Chrome, so pages must open there.
// The OS default browser (often Edge on Windows) would silently observe nothing.
function chromeCandidates(platform = process.platform, env = process.env) {
  if (platform === "win32") {
    const roots = [env.PROGRAMFILES, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(Boolean);
    return roots.map((root) => path.join(root, "Google", "Chrome", "Application", "chrome.exe"));
  }
  if (platform === "darwin") {
    return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  }
  return [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/opt/google/chrome/chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium"
  ];
}

function findChrome(platform = process.platform, env = process.env, exists = fs.existsSync) {
  return chromeCandidates(platform, env).find((candidate) => {
    try {
      return exists(candidate);
    } catch {
      return false;
    }
  }) || "";
}

module.exports = { chromeCandidates, findChrome };
