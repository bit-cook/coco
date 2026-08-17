import { constants } from "node:fs";
import { lstat, open, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { readCanonicalJson } from "./canonical-json.mjs";

const POLICY = "resources/project-resource-policy.v1.json";
const EXECUTABLE_DIRECTORIES = ["extensions", "hooks", "tools"];

export class ProjectResourcePreflightError extends Error {
  constructor(code) { super(code); this.code = code; this.name = "ProjectResourcePreflightError"; }
}

function identity(info) { return `${info.dev}:${info.ino}`; }
function failed(code = "PROJECT_RESOURCE_PREFLIGHT_FAILED") { throw new ProjectResourcePreflightError(code); }

async function pathInfo(path) {
  try { return await lstat(path); } catch (error) { if (error && error.code === "ENOENT") return null; failed(); }
}

async function policy(root) {
  try {
    const { parsed } = await readCanonicalJson(join(root, POLICY), "PROJECT_RESOURCE_PREFLIGHT_FAILED");
    if (parsed.schemaVersion !== 1 || parsed.policy !== "global-only" || Object.keys(parsed).length !== 2) failed();
  } catch (error) {
    if (error instanceof ProjectResourcePreflightError) throw error;
    failed();
  }
}

function strictJson(bytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { failed(); }
  let offset = 0;
  const whitespace = /[\u0009\u000a\u000d\u0020]/;
  const skip = () => { while (whitespace.test(text[offset] ?? "")) offset += 1; };
  const string = () => {
    if (text[offset] !== '"') failed();
    const start = offset++;
    let escaped = false;
    while (offset < text.length) {
      const character = text[offset++];
      if (!escaped && character === '"') {
        try { return JSON.parse(text.slice(start, offset)); } catch { failed(); }
      }
      if (!escaped && character.charCodeAt(0) < 0x20) failed();
      escaped = !escaped && character === "\\";
      if (character !== "\\") escaped = false;
    }
    failed();
  };
  const value = () => {
    skip();
    if (text[offset] === "{") {
      offset += 1;
      const keys = new Set();
      skip();
      if (text[offset] === "}") { offset += 1; return; }
      while (true) {
        skip();
        const key = string();
        if (keys.has(key)) failed();
        keys.add(key);
        skip();
        if (text[offset++] !== ":") failed();
        value();
        skip();
        if (text[offset] === "}") { offset += 1; return; }
        if (text[offset++] !== ",") failed();
      }
    }
    if (text[offset] === "[") {
      offset += 1;
      skip();
      if (text[offset] === "]") { offset += 1; return; }
      while (true) {
        value();
        skip();
        if (text[offset] === "]") { offset += 1; return; }
        if (text[offset++] !== ",") failed();
      }
    }
    if (text[offset] === '"') { string(); return; }
    const start = offset;
    while (offset < text.length && !"\t\n\r ,]}".includes(text[offset])) offset += 1;
    if (start === offset) failed();
  };
  value();
  skip();
  if (offset !== text.length) failed();
  try { return JSON.parse(text); } catch { failed(); }
}

async function inspectSettings(path) {
  const info = await pathInfo(path);
  if (info === null) return;
  if (!info.isFile() || info.isSymbolicLink()) failed();
  let value;
  try { value = strictJson(await readFile(path)); } catch (error) { if (error instanceof ProjectResourcePreflightError) throw error; failed(); }
  if (value === null || Array.isArray(value) || typeof value !== "object") failed();
  for (const field of ["extensions", "packages"]) {
    if (!(field in value)) continue;
    if (!Array.isArray(value[field])) failed();
    if (value[field].length > 0) failed("PROJECT_EXECUTABLE_RESOURCES_FORBIDDEN");
  }
}

async function inspectExecutableDirectory(path) {
  const info = await pathInfo(path);
  if (info === null) return;
  if (!info.isDirectory() || info.isSymbolicLink()) failed();
  let names;
  try { names = await readdir(path); } catch { failed(); }
  if (names.length > 0) failed("PROJECT_EXECUTABLE_RESOURCES_FORBIDDEN");
}

async function inspectProjectResources(cwd) {
  const coco = join(cwd, ".coco");
  const info = await pathInfo(coco);
  if (info === null) return;
  if (!info.isDirectory() || info.isSymbolicLink()) failed();
  for (const name of EXECUTABLE_DIRECTORIES) await inspectExecutableDirectory(join(coco, name));
  await inspectSettings(join(coco, "settings.json"));
}

async function sameDirectory(handle, expected) {
  const info = await handle.stat();
  if (!info.isDirectory() || identity(info) !== expected) failed();
}

export async function preflightProjectResources({ cwd = ".", root, beforeCheckpoint, afterFinalCheckpoint } = {}) {
  await policy(root);
  let handle;
  try {
    if (process.platform === "win32") failed();
    handle = await open(cwd, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const initial = await handle.stat();
    if (!initial.isDirectory()) failed();
    const expected = identity(initial);
    const snapshot = process.platform === "linux" ? `/proc/self/fd/${handle.fd}` : cwd;
    await beforeCheckpoint?.("WALK1_PRE_IMPORT");
    await sameDirectory(handle, expected);
    await inspectProjectResources(snapshot);
    const revalidate = async () => {
      await beforeCheckpoint?.("WALK4_FINAL_PRELAUNCH");
      await sameDirectory(handle, expected);
      await inspectProjectResources(snapshot);
    };
    await afterFinalCheckpoint?.({ cwd: snapshot, identity: expected });
    return { close: async () => handle.close(), cwd: snapshot, identity: expected, policy: "global-only", revalidate };
  } catch (error) {
    await handle?.close();
    if (error instanceof ProjectResourcePreflightError) throw error;
    failed();
  }
}
