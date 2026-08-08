"use strict";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_USER_AGENT = "DiscordBot (https://github.com/kaywhy331/cart-confirm-desktop, 3.0.0)";
const SNOWFLAKE_PATTERN = /^\d{15,25}$/;

class DiscordApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "DiscordApiError";
    this.status = Number(options.status || 0);
    this.retryAfterMs = Math.max(0, Number(options.retryAfterMs || 0));
  }
}

function normalizeBotToken(value) {
  const token = String(value || "").trim();
  if (token.length < 20 || token.length > 200 || /\s/.test(token)) {
    throw new Error("Enter a valid Discord bot token (never a Discord user token)." );
  }
  return token;
}

function normalizeSnowflake(value, label = "Discord channel ID") {
  const snowflake = String(value || "").trim();
  if (!SNOWFLAKE_PATTERN.test(snowflake)) throw new Error(`Enter a valid ${label}.`);
  return snowflake;
}

async function discordRequest(pathname, tokenValue, options = {}) {
  const token = normalizeBotToken(tokenValue);
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Math.min(30_000, Math.max(1_000, Number(options.timeoutMs) || 10_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${DISCORD_API_BASE}${pathname}`, {
      method: "GET",
      headers: {
        Authorization: `Bot ${token}`,
        "User-Agent": DISCORD_USER_AGENT,
        Accept: "application/json"
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new DiscordApiError("Discord did not respond before the local timeout.");
    throw new DiscordApiError("Discord could not be reached from this computer.");
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  if (response.ok) return payload;
  if (response.status === 429) {
    const retryAfterMs = Math.min(5 * 60_000, Math.max(1_000, Number(payload?.retry_after || 1) * 1_000));
    throw new DiscordApiError("Discord rate-limited signal checks; Cart Confirm will retry automatically.", {
      status: 429,
      retryAfterMs
    });
  }
  if (response.status === 401) {
    throw new DiscordApiError("Discord rejected the bot token. Create or reset a bot token in the Discord Developer Portal.", { status: 401 });
  }
  if (response.status === 403) {
    throw new DiscordApiError("The Discord bot cannot view that channel or read its message history.", { status: 403 });
  }
  if (response.status === 404) {
    throw new DiscordApiError("That Discord channel was not found for this bot.", { status: 404 });
  }
  throw new DiscordApiError(`Discord returned HTTP ${response.status}.`, { status: response.status });
}

async function getDiscordChannelSetup(token, channelIdValue, options = {}) {
  const channelId = normalizeSnowflake(channelIdValue);
  const channel = await discordRequest(`/channels/${channelId}`, token, options);
  const guildId = channel?.guild_id ? normalizeSnowflake(channel.guild_id, "Discord server ID") : "";
  let roles = [];
  if (guildId) {
    roles = await discordRequest(`/guilds/${guildId}/roles`, token, options);
  }
  return Object.freeze({
    channelId,
    channelName: String(channel?.name || "Discord channel").slice(0, 100),
    guildId,
    roleNames: Object.fromEntries((Array.isArray(roles) ? roles : [])
      .filter((role) => SNOWFLAKE_PATTERN.test(String(role?.id || "")))
      .map((role) => [String(role.id), String(role.name || "").slice(0, 100)]))
  });
}

async function getDiscordMessages(token, channelIdValue, options = {}) {
  const channelId = normalizeSnowflake(channelIdValue);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const query = new URLSearchParams({ limit: String(limit) });
  if (options.after) query.set("after", normalizeSnowflake(options.after, "Discord message cursor"));
  const payload = await discordRequest(`/channels/${channelId}/messages?${query}`, token, options);
  if (!Array.isArray(payload)) throw new DiscordApiError("Discord returned an unreadable message list.");
  return payload;
}

function snowflakeAscending(left, right) {
  try {
    const a = BigInt(String(left?.id || 0));
    const b = BigInt(String(right?.id || 0));
    return a < b ? -1 : a > b ? 1 : 0;
  } catch {
    return String(left?.id || "").localeCompare(String(right?.id || ""));
  }
}

function decorateMessageRoles(message, roleNames = {}) {
  const mentionedNames = (Array.isArray(message?.mention_roles) ? message.mention_roles : [])
    .map((roleId) => roleNames[String(roleId)] || "")
    .filter(Boolean)
    .map((name) => `@${name}`);
  if (!mentionedNames.length) return message;
  return { ...message, content: `${message.content || ""} ${mentionedNames.join(" ")}`.trim() };
}

module.exports = {
  DISCORD_API_BASE,
  DiscordApiError,
  decorateMessageRoles,
  getDiscordChannelSetup,
  getDiscordMessages,
  normalizeBotToken,
  normalizeSnowflake,
  snowflakeAscending
};
