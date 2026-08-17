"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const REPOSITORY = "kaywhy331/cart-confirm-desktop";
const RELEASES_URL = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=30`;
const MAX_RELEASE_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_CHECKSUM_BYTES = 1024 * 1024;
const MAX_INSTALLER_BYTES = 512 * 1024 * 1024;
const MAX_RELEASE_NOTES_CHARS = 6_000;
const DOWNLOAD_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com"
]);

function parseVersion(value) {
  const match = String(value || "").trim().match(/^(?:unsigned-)?v?(\d+)\.(\d+)\.(\d+)$/i);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    text: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`
  };
}

function compareVersions(left, right) {
  const a = typeof left === "string" ? parseVersion(left) : left;
  const b = typeof right === "string" ? parseVersion(right) : right;
  if (!a || !b) throw new Error("Update versions must use major.minor.patch format.");
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function assertAllowedHttpsUrl(value, allowedHosts) {
  const parsed = new URL(String(value || ""));
  if (
    parsed.protocol !== "https:"
    || !allowedHosts.has(parsed.hostname)
    || parsed.username
    || parsed.password
    || (parsed.port && parsed.port !== "443")
  ) {
    throw new Error("The update server returned an untrusted download address.");
  }
  return parsed;
}

function assertReleaseAssetUrl(value) {
  const parsed = assertAllowedHttpsUrl(value, new Set(["github.com"]));
  const prefix = `/${REPOSITORY}/releases/download/`;
  if (!parsed.pathname.startsWith(prefix)) {
    throw new Error("The update asset did not belong to the official Cart Confirm release path.");
  }
  return parsed.toString();
}

function normalizeReleaseNotes(value) {
  const normalized = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length <= MAX_RELEASE_NOTES_CHARS) return normalized;
  return `${normalized.slice(0, MAX_RELEASE_NOTES_CHARS - 1).trimEnd()}…`;
}

// The update dialog shows people what they are getting, not build
// provenance. Pull the bullet lines out of the release body's "What's new"
// section; a release without one (or with no bullets anywhere) yields an
// empty string so the caller can show a plain fallback line instead of
// checksum boilerplate.
function userFacingReleaseNotes(notes) {
  const lines = String(notes || "").split("\n").map((line) => line.trim());
  const heading = lines.findIndex((line) => /^#{1,3}\s*what.?s new/i.test(line));
  const scoped = heading >= 0
    ? lines.slice(heading + 1, (() => {
      const next = lines.slice(heading + 1).findIndex((line) => /^#{1,3}\s/.test(line));
      return next < 0 ? lines.length : heading + 1 + next;
    })())
    : [];
  const bulletsOf = (candidates) => candidates
    .filter((line) => /^[-*•]\s+/.test(line))
    .map((line) => `• ${line.replace(/^[-*•]\s+/, "")}`);
  const bullets = heading >= 0 ? bulletsOf(scoped) : bulletsOf(lines);
  return bullets.slice(0, 10).join("\n");
}

function releasePlan(release) {
  if (!release || release.draft) return null;
  const version = parseVersion(release.tag_name);
  if (!version || !Array.isArray(release.assets)) return null;
  const setupName = `Cart-Confirm-Setup-${version.text}-x64.exe`;
  const setup = release.assets.find((asset) => asset?.name === setupName);
  const checksums = release.assets.find((asset) => asset?.name === "SHA256SUMS.txt");
  if (!setup?.browser_download_url || !checksums?.browser_download_url) return null;
  return {
    version: version.text,
    tagName: String(release.tag_name),
    releaseName: String(release.name || `Cart Confirm v${version.text}`).slice(0, 160),
    releaseNotes: normalizeReleaseNotes(release.body),
    prerelease: Boolean(release.prerelease),
    publishedAt: String(release.published_at || ""),
    pageUrl: String(release.html_url || ""),
    setupAsset: {
      name: setupName,
      size: Number(setup.size || 0),
      url: assertReleaseAssetUrl(setup.browser_download_url)
    },
    checksumsAsset: {
      name: "SHA256SUMS.txt",
      size: Number(checksums.size || 0),
      url: assertReleaseAssetUrl(checksums.browser_download_url)
    }
  };
}

function selectUpdate(releases, currentVersion) {
  const current = parseVersion(currentVersion);
  if (!current) throw new Error("The installed app version is invalid.");
  const plans = (Array.isArray(releases) ? releases : [])
    .map(releasePlan)
    .filter(Boolean)
    .filter((plan) => compareVersions(plan.version, current) > 0)
    .sort((left, right) => (
      compareVersions(right.version, left.version)
      || Number(left.prerelease) - Number(right.prerelease)
    ));
  return plans[0] || null;
}

function parseChecksumManifest(text, expectedName) {
  const matches = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^([a-f0-9]{64})\s{2}([^\\/]+)$/i);
    if (match && match[2] === expectedName) matches.push(match[1].toLowerCase());
  }
  if (matches.length !== 1) {
    throw new Error(`The release checksum manifest must contain exactly one entry for ${expectedName}.`);
  }
  return matches[0];
}

function requestHeaders(version, accept) {
  return {
    Accept: accept,
    "User-Agent": `Cart-Confirm/${String(version || "unknown").slice(0, 40)}`,
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

async function openResponse(url, options = {}, redirectCount = 0) {
  const allowedHosts = options.allowedHosts || DOWNLOAD_HOSTS;
  const parsed = assertAllowedHttpsUrl(url, allowedHosts);
  return new Promise((resolve, reject) => {
    const request = https.get(parsed, { headers: options.headers || {} }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        if (redirectCount >= 5) {
          reject(new Error("The update download redirected too many times."));
          return;
        }
        let redirected;
        try {
          redirected = new URL(response.headers.location, parsed);
          assertAllowedHttpsUrl(redirected, allowedHosts);
        } catch (error) {
          reject(error);
          return;
        }
        resolve(openResponse(redirected, options, redirectCount + 1));
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`The update server returned HTTP ${response.statusCode}.`));
        return;
      }
      resolve(response);
    });
    request.setTimeout(30_000, () => request.destroy(new Error("The update request timed out.")));
    request.on("error", reject);
  });
}

async function readResponse(url, options, maximumBytes) {
  const response = await openResponse(url, options);
  const chunks = [];
  let size = 0;
  for await (const chunk of response) {
    size += chunk.length;
    if (size > maximumBytes) {
      response.destroy();
      throw new Error("The update server response was unexpectedly large.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

async function fetchReleases(currentVersion) {
  const body = await readResponse(RELEASES_URL, {
    allowedHosts: new Set(["api.github.com"]),
    headers: requestHeaders(currentVersion, "application/vnd.github+json")
  }, MAX_RELEASE_RESPONSE_BYTES);
  let releases;
  try {
    releases = JSON.parse(body.toString("utf8"));
  } catch {
    throw new Error("GitHub returned an invalid release list.");
  }
  if (!Array.isArray(releases)) throw new Error("GitHub did not return a release list.");
  return releases;
}

async function checkForUpdate(currentVersion) {
  return selectUpdate(await fetchReleases(currentVersion), currentVersion);
}

async function downloadUpdate(plan, destinationDirectory, onProgress = () => {}) {
  if (!plan?.setupAsset || !plan?.checksumsAsset) throw new Error("The selected update is incomplete.");
  assertReleaseAssetUrl(plan.setupAsset.url);
  assertReleaseAssetUrl(plan.checksumsAsset.url);
  if (plan.setupAsset.size > MAX_INSTALLER_BYTES) throw new Error("The update installer is unexpectedly large.");

  onProgress({ phase: "checksum", received: 0, total: plan.checksumsAsset.size || 0 });
  const checksumBody = await readResponse(plan.checksumsAsset.url, {
    allowedHosts: DOWNLOAD_HOSTS,
    headers: requestHeaders(plan.version, "text/plain")
  }, MAX_CHECKSUM_BYTES);
  const expectedHash = parseChecksumManifest(checksumBody.toString("utf8"), plan.setupAsset.name);

  fs.mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 });
  const destination = path.join(destinationDirectory, plan.setupAsset.name);
  const temporary = `${destination}.download`;
  fs.rmSync(temporary, { force: true });
  const hash = crypto.createHash("sha256");
  let received = 0;
  try {
    const response = await openResponse(plan.setupAsset.url, {
      allowedHosts: DOWNLOAD_HOSTS,
      headers: requestHeaders(plan.version, "application/octet-stream")
    });
    const responseLength = Number(response.headers["content-length"] || 0);
    const total = plan.setupAsset.size || responseLength;
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        if (received > MAX_INSTALLER_BYTES) {
          callback(new Error("The update installer exceeded the maximum allowed size."));
          return;
        }
        hash.update(chunk);
        onProgress({ phase: "downloading", received, total });
        callback(null, chunk);
      }
    });
    await pipeline(response, meter, fs.createWriteStream(temporary, { mode: 0o600 }));
    if (plan.setupAsset.size && received !== plan.setupAsset.size) {
      throw new Error("The downloaded installer size did not match the GitHub release asset.");
    }
    onProgress({ phase: "verifying", received, total });
    const actualHash = hash.digest("hex");
    if (actualHash !== expectedHash) {
      throw new Error("The downloaded installer failed SHA-256 verification and will not be opened.");
    }
    fs.rmSync(destination, { force: true });
    fs.renameSync(temporary, destination);
    return { installerPath: destination, sha256: actualHash, size: received };
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

module.exports = {
  checkForUpdate,
  compareVersions,
  downloadUpdate,
  normalizeReleaseNotes,
  parseChecksumManifest,
  parseVersion,
  releasePlan,
  userFacingReleaseNotes,
  selectUpdate
};
