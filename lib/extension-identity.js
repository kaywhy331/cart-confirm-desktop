"use strict";

const EXTENSION_ID = "kmpoonjaidgnldeobaaopfhfhlalclhd";
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;

function isAllowedExtensionOrigin(value) {
  return String(value || "") === EXTENSION_ORIGIN;
}

module.exports = { EXTENSION_ID, EXTENSION_ORIGIN, isAllowedExtensionOrigin };
