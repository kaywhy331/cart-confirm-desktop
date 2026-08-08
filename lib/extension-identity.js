"use strict";

const EXTENSION_ID = "kmpoonjaidgnldeobaaopfhfhlalclhd";
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

function isAllowedExtensionOrigin(value) {
  return String(value || "") === EXTENSION_ORIGIN;
}

// The Host header must name the loopback interface. A DNS-rebinding page
// (attacker.example resolving to 127.0.0.1) sends its own hostname here, so
// this check keeps such pages same-origin-blind to the local server.
function isLoopbackHost(hostHeader) {
  const host = String(hostHeader || "").toLowerCase();
  const hostname = host.startsWith("[")
    ? host.replace(/\]:\d+$/, "]")
    : host.replace(/:\d+$/, "");
  return LOOPBACK_HOSTNAMES.has(hostname);
}

// Chrome omits the Origin header on extension GETs that bypass CORS through
// host permissions, so requiring the pinned origin on every request rejected
// the companion itself. Trust a request when the Host is loopback AND it
// either presents the pinned extension origin, or presents no origin at all
// together with the pinned extension id header (which the companion always
// sends, and which a cross-origin web page cannot combine with a loopback
// Host). Any explicit foreign origin is rejected outright.
function isTrustedCompanionRequest(originHeader, hostHeader, extensionIdHeader) {
  if (!isLoopbackHost(hostHeader)) return false;
  const origin = String(originHeader || "");
  if (origin) return origin === EXTENSION_ORIGIN;
  return String(extensionIdHeader || "") === EXTENSION_ID;
}

module.exports = {
  EXTENSION_ID,
  EXTENSION_ORIGIN,
  isAllowedExtensionOrigin,
  isLoopbackHost,
  isTrustedCompanionRequest
};
