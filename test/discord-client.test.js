"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  decorateMessageRoles,
  getDiscordChannelSetup,
  getDiscordMessages
} = require("../lib/discord-client");

const TOKEN = "a-valid-local-discord-bot-token-value";
const PACKAGE_VERSION = require("../package.json").version;

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("official bot setup resolves channel and mentioned role names", async () => {
  const calls = [];
  const setup = await getDiscordChannelSetup(TOKEN, "123456789012345678", {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/channels/123456789012345678")) {
        return response(200, { id: "123456789012345678", guild_id: "223456789012345678", name: "restocks" });
      }
      return response(200, [{ id: "323456789012345678", name: "Target 2" }]);
    }
  });
  assert.equal(setup.channelName, "restocks");
  assert.equal(setup.roleNames["323456789012345678"], "Target 2");
  assert.equal(calls[0].options.headers.Authorization, `Bot ${TOKEN}`);
  assert.equal(
    calls[0].options.headers["User-Agent"],
    `DiscordBot (https://github.com/kaywhy331/cart-confirm-desktop, ${PACKAGE_VERSION})`
  );
});

test("message polling uses a bounded after cursor", async () => {
  let requested = "";
  const messages = await getDiscordMessages(TOKEN, "123456789012345678", {
    after: "423456789012345678",
    limit: 500,
    fetchImpl: async (url) => {
      requested = url;
      return response(200, [{ id: "523456789012345678" }]);
    }
  });
  assert.equal(messages.length, 1);
  assert.match(requested, /limit=100/);
  assert.match(requested, /after=423456789012345678/);
});

test("role IDs are decorated with names before restock parsing", () => {
  const message = decorateMessageRoles({ content: "drop", mention_roles: ["323456789012345678"] }, {
    "323456789012345678": "Target 2"
  });
  assert.equal(message.content, "drop @Target 2");
});

test("authorization failures never echo the bot token", async () => {
  await assert.rejects(
    () => getDiscordMessages(TOKEN, "123456789012345678", {
      fetchImpl: async () => response(401, { message: TOKEN })
    }),
    (error) => error.status === 401 && !error.message.includes(TOKEN)
  );
});
