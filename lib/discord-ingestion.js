"use strict";

const { decorateMessageRoles, snowflakeAscending } = require("./discord-client");
const { parseDiscordRestockMessage } = require("./restock-signal");

function processDiscordMessageBatch(messages, state = {}, options = {}) {
  const historical = !state.lastMessageId && !state.baselineAt;
  const ordered = [...(Array.isArray(messages) ? messages : [])].sort(snowflakeAscending);
  const signals = ordered
    .map((message) => decorateMessageRoles(message, options.roleNames || {}))
    .map((message) => parseDiscordRestockMessage(message))
    .filter(Boolean);
  const recordedAt = new Date(options.now ?? Date.now()).toISOString();

  return Object.freeze({
    historical,
    signals,
    lastMessageId: ordered.length
      ? String(ordered.at(-1)?.id || "").slice(0, 40)
      : String(state.lastMessageId || "").slice(0, 40),
    baselineAt: historical ? recordedAt : String(state.baselineAt || "").slice(0, 40),
    lastPollAt: recordedAt
  });
}

module.exports = { processDiscordMessageBatch };
