import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";

test("scanner command exists in built cli", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-scan-rootless-"));
  writeFileSync(
    path.join(temp, "package.json"),
    JSON.stringify({ name: "scan-rootless", packageManager: "yarn@4.5.3", dependencies: { react: "19.0.0" } }, null, 2)
  );
  writeFileSync(path.join(temp, "yarn.lock"), "# lock");
  execSync(`node "${path.resolve("dist/cli.js")}" scan --json > /dev/null`, { cwd: temp });
  const parsed = JSON.parse(fs.readFileSync(path.join(temp, ".haus-ai/context-map.json"), "utf8"));
  assert.equal(typeof parsed.repoName, "string");
  assert.equal(Array.isArray(parsed.repoRoles), true);
  assert.equal(typeof parsed.confidence, "number");
});

test("scanner hashes change when file content changes", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-scan-"));
  mkdirSync(path.join(temp, "src"), { recursive: true });
  writeFileSync(
    path.join(temp, "package.json"),
    JSON.stringify({ name: "scan-temp", packageManager: "yarn@4.5.3", dependencies: { react: "19.0.0" } }, null, 2)
  );
  writeFileSync(path.join(temp, "yarn.lock"), "# lock");

  execSync(`node "${path.resolve("dist/cli.js")}" scan --json > /dev/null`, { cwd: temp });
  const hashA = JSON.parse(readFileSync(path.join(temp, ".haus-ai/scan-hashes.json"), "utf8"));

  writeFileSync(path.join(temp, "package.json"), JSON.stringify({ name: "scan-temp", packageManager: "yarn@4.5.3", dependencies: {} }, null, 2));
  execSync(`node "${path.resolve("dist/cli.js")}" scan --json > /dev/null`, { cwd: temp });
  const hashB = JSON.parse(readFileSync(path.join(temp, ".haus-ai/scan-hashes.json"), "utf8"));

  assert.notEqual(hashA["package.json"], hashB["package.json"]);
});

test("scanner detects NestFactory and graphql schema hints", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "haus-scan-nest-"));
  mkdirSync(path.join(temp, "src"), { recursive: true });
  writeFileSync(path.join(temp, "package.json"), JSON.stringify({ name: "nest-temp", packageManager: "yarn@4.5.3", dependencies: { "@nestjs/core": "11.0.0" } }, null, 2));
  writeFileSync(path.join(temp, "yarn.lock"), "# lock");
  writeFileSync(path.join(temp, "src/main.ts"), "import { NestFactory } from '@nestjs/core';");
  writeFileSync(path.join(temp, "schema.graphql"), "type Query { health: String }");

  execSync(`node "${path.resolve("dist/cli.js")}" scan --json > /dev/null`, { cwd: temp });
  const context = JSON.parse(readFileSync(path.join(temp, ".haus-ai/context-map.json"), "utf8"));
  assert.equal(context.detectedStacks.backend.includes("nestjs"), true);
  assert.equal(context.detectedStacks.backend.includes("graphql"), true);
});
