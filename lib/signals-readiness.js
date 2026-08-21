"use strict";

(function exposeSignalsReadiness(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CartConfirmSignalsReadiness = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function sourceState(snapshot = {}) {
    const settings = snapshot.settings || {};
    const bridge = snapshot.signalBridge || {};
    const discord = snapshot.discord || {};
    const status = snapshot.status || {};
    const mappingCount = Math.max(0, Number(bridge.mappingCount) || 0);

    const browser = {
      id: "browser",
      label: "Browser pages",
      configured: status.companion === "connected",
      ready: status.companion === "connected",
      detail: status.companion === "connected"
        ? "A store page is connected and can report exact browser observations."
        : "Open one configured item page with the Cart Confirm Companion to enable browser-page signals.",
      action: "connect-chrome"
    };

    const trackalackerConfigured = settings.trackalackerSignalBridgeEnabled === true && bridge.enabled !== false;
    const trackalackerReady = Boolean(
      trackalackerConfigured
      && bridge.deliveryPaused !== true
      && bridge.extensionConnected === true
      && bridge.listenerReady === true
      && bridge.subscriptionPresent === true
      && mappingCount > 0
    );
    let trackalackerDetail = "Enable TrackaLacker Web Push and enroll it from the signed-in Chrome profile.";
    let trackalackerAction = "configure-signals";
    if (trackalackerConfigured && bridge.deliveryPaused === true) {
      trackalackerDetail = "TrackaLacker delivery is paused; resume it before starting Signals.";
    } else if (trackalackerConfigured && bridge.extensionConnected !== true) {
      trackalackerDetail = "The Cart Confirm Companion has not recently confirmed the TrackaLacker bridge.";
      trackalackerAction = "connect-trackalacker";
    } else if (trackalackerConfigured && (bridge.listenerReady !== true || bridge.subscriptionPresent !== true)) {
      trackalackerDetail = "Complete TrackaLacker push enrollment in the signed-in Chrome profile.";
      trackalackerAction = "connect-trackalacker";
    } else if (trackalackerConfigured && mappingCount === 0) {
      trackalackerDetail = "Push is enrolled, but no followed-product mappings have been scanned yet.";
      trackalackerAction = "scan-trackalacker";
    } else if (trackalackerReady) {
      trackalackerDetail = `${mappingCount} exact followed-product mapping${mappingCount === 1 ? " is" : "s are"} ready.`;
      trackalackerAction = "none";
    }
    const trackalacker = {
      id: "trackalacker",
      label: "TrackaLacker Push",
      configured: trackalackerConfigured,
      ready: trackalackerReady,
      detail: trackalackerDetail,
      action: trackalackerAction,
      mappingCount
    };

    const discordConfigured = discord.configured === true || settings.discordEnabled === true;
    const discordReady = Boolean(settings.discordEnabled === true && discord.connected === true);
    const discordSource = {
      id: "discord",
      label: "Discord bot",
      configured: discordConfigured,
      ready: discordReady,
      detail: discordReady
        ? `The official bot is listening${discord.channelName ? ` in #${String(discord.channelName).slice(0, 80)}` : ""}.`
        : discordConfigured
          ? "Reconnect the saved official Discord bot before relying on this source."
          : "Connect an optional official Discord bot to add this source.",
      action: "configure-signals"
    };

    const sources = [trackalacker, browser, discordSource];
    const ready = sources.filter((source) => source.ready);
    const configuredProblems = sources.filter((source) => source.configured && !source.ready);
    return Object.freeze({
      sources: Object.freeze(sources.map((source) => Object.freeze(source))),
      ready: Object.freeze(ready.map((source) => Object.freeze({ ...source }))),
      configuredProblems: Object.freeze(configuredProblems.map((source) => Object.freeze({ ...source }))),
      readyCount: ready.length,
      canStart: ready.length > 0,
      summary: ready.length
        ? `${ready.length} signal source${ready.length === 1 ? " is" : "s are"} ready: ${ready.map((source) => source.label).join(", ")}.`
        : "No signal source is ready. Connect Chrome, enroll and map TrackaLacker Push, or connect Discord.",
      hardIssue: ready.length
        ? ""
        : "Signals needs at least one ready source: a connected store page, enrolled TrackaLacker Push with mappings, or a connected Discord bot."
    });
  }

  return Object.freeze({ sourceState });
});
