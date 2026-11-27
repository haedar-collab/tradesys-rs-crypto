"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const htmlPath = path.resolve(__dirname, "..", "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
const match = html.match(/<script>\s*(\/\* Tradesys Edge Crypto engine[\s\S]*?)<\/script>/i);

if (!match) {
  throw new Error("Could not locate the Tradesys Edge Crypto engine script in index.html");
}

const moduleShim = { exports: {} };
vm.runInNewContext(match[1], { module: moduleShim, exports: moduleShim.exports }, {
  filename: "tradesys-engine-baseline.js",
  timeout: 5000
});

module.exports = moduleShim.exports;
