"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const desktopTraffic = require("../lib/traffic-status");
const extensionTraffic = require("../extension/traffic");

test("desktop quiet checks and the browser companion share overload status semantics", () => {
  for (const status of [200, 404, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]) {
    assert.equal(desktopTraffic.isOverloadStatus(status), extensionTraffic.isOverloadStatus(status));
  }
  assert.equal(desktopTraffic.parseRetryAfter("120", 0), 120_000);
  assert.equal(desktopTraffic.parseRetryAfter("999999", 0), 86_400_000);
  assert.equal(desktopTraffic.parseRetryAfter("invalid", 0), 0);
});
