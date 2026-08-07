"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { chromeCandidates, findChrome } = require("../lib/chrome-launcher");

test("windows chrome candidates cover machine-wide and per-user installs", () => {
  const env = {
    PROGRAMFILES: "C:\\Program Files",
    "ProgramFiles(x86)": "C:\\Program Files (x86)",
    LOCALAPPDATA: "C:\\Users\\kevin\\AppData\\Local"
  };
  const candidates = chromeCandidates("win32", env);
  assert.equal(candidates.length, 3);
  for (const candidate of candidates) {
    assert.equal(candidate.endsWith(path.join("Google", "Chrome", "Application", "chrome.exe")), true);
  }
});

test("findChrome returns the first existing candidate or empty", () => {
  const env = { PROGRAMFILES: "C:\\Program Files", LOCALAPPDATA: "C:\\Users\\kevin\\AppData\\Local" };
  const installed = path.join("C:\\Users\\kevin\\AppData\\Local", "Google", "Chrome", "Application", "chrome.exe");
  assert.equal(findChrome("win32", env, (candidate) => candidate === installed), installed);
  assert.equal(findChrome("win32", env, () => false), "");
  assert.equal(findChrome("win32", {}, () => true), "");
});
