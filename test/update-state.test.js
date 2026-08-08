"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { planVersionReload } = require("../extension/update-state");

test("a bundled version transition requests one automatic companion reload", () => {
  const first = planVersionReload(null, "2.10.0", "2.9.0", 1_000);
  assert.equal(first.reload, true);
  assert.deepEqual(first.state, { transition: "2.9.0->2.10.0", attemptedAt: 1_000 });

  const duplicate = planVersionReload(first.state, "2.10.0", "2.9.0", 2_000);
  assert.equal(duplicate.reload, false, "the same stale folder must not create a reload loop");
});

test("matching versions and a later transition behave independently", () => {
  assert.deepEqual(planVersionReload(null, "2.9.0", "2.9.0"), { reload: false, state: null });
  const previous = { transition: "2.9.0->2.10.0", attemptedAt: 1_000 };
  const next = planVersionReload(previous, "2.11.0", "2.9.0", 3_000);
  assert.equal(next.reload, true);
  assert.equal(next.state.transition, "2.9.0->2.11.0");
});
