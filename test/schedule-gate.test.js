"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { calendarOpenAt, calendarOwned, waitingMessage } = require("../extension/schedule-gate");

test("browser automation stays calendar-owned until the desktop clears the gate", () => {
  const future = new Date(2_000_000).toISOString();
  assert.equal(calendarOwned({ openAt: future }), true);
  assert.equal(calendarOwned({ calendarOwned: true, calendarOpenAt: future, openAt: "" }), true);
  assert.equal(calendarOpenAt({ calendarOpenAt: future }), future);
  assert.equal(calendarOwned({ openAt: "", calendarOwned: false }), false);
});

test("calendar wait status distinguishes future ownership from a missed release", () => {
  const future = { calendarOwned: true, calendarOpenAt: new Date(2_000_000).toISOString() };
  assert.match(waitingMessage(future, "Target", 1_000_000), /idle until the desktop releases it/);
  assert.match(waitingMessage(future, "Target", 3_000_000), /cannot run early or late/);
});
