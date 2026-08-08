"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { processDiscordMessageBatch } = require("../lib/discord-ingestion");

function targetMessage(id, timestamp, sku) {
  return {
    id,
    channel_id: "123456789012345678",
    timestamp,
    content: "@Target restock",
    mention_roles: ["223456789012345678"],
    embeds: [{
      title: `Pokemon box ${sku}`,
      fields: [
        { name: "SKU", value: sku },
        { name: "Price", value: "$59.99" }
      ]
    }]
  };
}

test("a first connection imports its bounded batch as history", () => {
  const batch = processDiscordMessageBatch([
    targetMessage("423456789012345679", "2026-08-08T17:20:01.000Z", "95298172"),
    targetMessage("423456789012345678", "2026-08-08T17:20:00.000Z", "1011483406")
  ], {}, {
    now: Date.parse("2026-08-08T17:20:02.000Z"),
    roleNames: { "223456789012345678": "Target" }
  });

  assert.equal(batch.historical, true);
  assert.equal(batch.signals.length, 2);
  assert.equal(batch.signals[0].sku, "1011483406");
  assert.equal(batch.lastMessageId, "423456789012345679");
  assert.equal(batch.baselineAt, "2026-08-08T17:20:02.000Z");
});

test("messages after an established cursor are live signals", () => {
  const batch = processDiscordMessageBatch([
    targetMessage("523456789012345679", "2026-08-08T17:21:00.000Z", "95298172")
  ], {
    lastMessageId: "423456789012345679",
    baselineAt: "2026-08-08T17:20:02.000Z"
  }, { now: Date.parse("2026-08-08T17:21:01.000Z") });

  assert.equal(batch.historical, false);
  assert.equal(batch.signals.length, 1);
  assert.equal(batch.lastMessageId, "523456789012345679");
  assert.equal(batch.baselineAt, "2026-08-08T17:20:02.000Z");
});
