import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { bootstrapNpm } from "../scripts/bootstrap-npm.mjs";
import { installWithTimeout, MAX_NPM_ARCHIVE_BYTES, sri } from "../scripts/npm-bootstrap-runtime.mjs";

async function archive(root, source) {
  const packageRoot = join(root, "source", "package", "bin");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "npm-cli.js"), source);
  const tarball = join(root, "npm.tgz");
  execFileSync("tar", ["-czf", tarball, "-C", join(root, "source"), "package"]);
  return { bytes: await readFile(tarball), tarball };
}

async function withFixture(run) {
  const root = await mkdtemp(join(tmpdir(), "coco-bootstrap-failures-"));
  try { await run(root); } finally { await rm(root, { force: true, recursive: true }); }
}

async function absent(path) { await assert.rejects(lstat(path), { code: "ENOENT" }); }

async function waitForFile(path) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try { return await readFile(path, "utf8"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${path}`);
}

function dead(pid) { try { process.kill(pid, 0); return false; } catch (error) { return error?.code === "ESRCH"; } }

async function waitForTermination(pid) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (dead(pid)) return true;
    try {
      const stat = await readFile(`/proc/${pid}/stat`, "utf8");
      if (stat.slice(stat.lastIndexOf(") ") + 2).startsWith("Z ")) return true;
    } catch (error) {
      if (error?.code === "ENOENT") return true;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return dead(pid);
}

function fixtureContainment(root, afterKill = async () => {}) {
  const group = join(root, "containment");
  async function pids() {
    try {
      return (await readFile(join(group, "cgroup.procs"), "utf8")).trim().split("\n").filter(Boolean).map(Number).filter((pid) => !dead(pid));
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }
  return {
    create: async () => {
      await mkdir(group);
      await writeFile(join(group, "cgroup.procs"), "");
      return group;
    },
    kill: async () => {
      for (const pid of await pids()) process.kill(pid, "SIGKILL");
      await afterKill();
    },
    pids,
    remove: () => rm(group, { force: true, recursive: true }),
  };
}

function controlledRequest({ body, headers = {}, statusCode = 200, timeout = false }) {
  return (_url, _options, onResponse) => {
    const request = new EventEmitter();
    request.destroy = (error) => process.nextTick(() => request.emit("error", error));
    process.nextTick(() => {
      if (timeout) { request.emit("timeout"); request.emit("close"); return; }
      const response = new EventEmitter();
      response.headers = headers;
      response.statusCode = statusCode;
      response.resume = () => {};
      onResponse(response);
      if (body) response.emit("data", body);
      response.emit("end");
      request.emit("close");
    });
    return request;
  };
}

const installScript = `
  const { mkdirSync, writeFileSync } = require("node:fs");
  const { join } = require("node:path");
  mkdirSync(join(process.cwd(), "node_modules"), { recursive: true });
  writeFileSync(join(process.cwd(), "package-lock.json"), JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "node_modules/npm": { version: "11.18.0", resolved: "https://registry.npmjs.org/npm/-/npm-11.18.0.tgz", integrity: "sha512-T67M4L5wNm0cZ7EBLErcEkY1SmzEW/WJ+SADBzsFUY1UdAPfFHXFQtZ6SEXiK0+vzXysCvAsepbMaBTwnrAD+w==" },
      "node_modules/@earendil-works/pi-coding-agent": { version: "0.82.1" }
    }
  }));
`;

test("Given controlled HTTP rejection modes, when bootstrap downloads, then each reaches DOWNLOAD", async () => {
  const modes = [
    { headers: {}, statusCode: 404 },
    { headers: { location: "https://elsewhere.invalid" } },
    { body: Buffer.alloc(MAX_NPM_ARCHIVE_BYTES + 1) },
    { timeout: true },
  ];
  for (const mode of modes) await withFixture(async (root) => {
    const result = await bootstrapNpm({ dependencies: { request: controlledRequest(mode) }, root });
    assert.equal(result.code, "NPM_BOOTSTRAP_DOWNLOAD");
    await absent(join(root, "package-lock.json"));
    await absent(join(root, "node_modules"));
  });
});

test("Given tampered archive bytes, when bootstrap verifies the download, then it reaches SRI", async () => {
  await withFixture(async (root) => {
    const result = await bootstrapNpm({
      dependencies: { download: async (destination) => writeFile(destination, "tampered") },
      root,
    });
    assert.equal(result.code, "NPM_BOOTSTRAP_SRI");
  });
});

test("Given broken and symlinked archives, when bootstrap extracts them, then it reaches EXTRACT", async () => {
  await withFixture(async (root) => {
    const bytes = Buffer.from("not-a-gzip");
    const result = await bootstrapNpm({ dependencies: { download: async (destination) => writeFile(destination, bytes), expectedSri: sri(bytes) }, root });
    assert.equal(result.code, "NPM_BOOTSTRAP_EXTRACT");
  });
  await withFixture(async (root) => {
    const source = join(root, "source", "package", "bin");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "npm-cli.js"), "");
    await symlink("npm-cli.js", join(source, "malicious-link"));
    const tarball = join(root, "symlink.tgz");
    execFileSync("tar", ["-czf", tarball, "-C", join(root, "source"), "package"]);
    const bytes = await readFile(tarball);
    const result = await bootstrapNpm({ dependencies: { download: async (destination) => writeFile(destination, bytes), expectedSri: sri(bytes) }, root });
    assert.equal(result.code, "NPM_BOOTSTRAP_EXTRACT");
  });
});

test("Given missing executable and a failed npm process spawn, when bootstrap installs, then it distinguishes EXTRACT and SPAWN", async () => {
  await withFixture(async (root) => {
    const source = join(root, "source", "package");
    await mkdir(source, { recursive: true });
    const tarball = join(root, "missing-cli.tgz");
    execFileSync("tar", ["-czf", tarball, "-C", join(root, "source"), "package"]);
    const bytes = await readFile(tarball);
    assert.equal((await bootstrapNpm({ dependencies: { download: async (destination) => writeFile(destination, bytes), expectedSri: sri(bytes) }, root })).code, "NPM_BOOTSTRAP_EXTRACT");
  });
  await withFixture(async (root) => {
    const fixture = await archive(root, installScript);
    const result = await bootstrapNpm({
      dependencies: {
        download: async (destination) => writeFile(destination, fixture.bytes),
        expectedSri: sri(fixture.bytes),
        spawn: (command, args, options) => {
          if (command === "tar") return spawn(command, args, options);
          const child = new EventEmitter();
          child.pid = 12345;
          process.nextTick(() => child.emit("error", new Error("ENOENT")));
          return child;
        },
      },
      root,
    });
    assert.equal(result.code, "NPM_BOOTSTRAP_SPAWN");
    assert.equal(result.command, undefined);
    await absent(join(root, "package-lock.json"));
  });
});

test("Given nonzero or malformed installs, when bootstrap finishes the child, then it returns INSTALL and removes only generated artifacts", async () => {
  for (const source of [`${installScript} process.exit(1);`, `${installScript} writeFileSync(join(process.cwd(), "package-lock.json"), "{}");`]) await withFixture(async (root) => {
    const fixture = await archive(root, source);
    const result = await bootstrapNpm({ dependencies: { containment: fixtureContainment(root), download: async (destination) => writeFile(destination, fixture.bytes), expectedSri: sri(fixture.bytes) }, root });
    assert.equal(result.code, "NPM_BOOTSTRAP_INSTALL");
    await absent(join(root, "package-lock.json"));
    await absent(join(root, "node_modules"));
  });
});

test("Given a bootstrap install, when it invokes npm, then its command and cwd are exact", async () => {
  await withFixture(async (root) => {
    const fixture = await archive(root, `${installScript} process.exit(1);`);
    let invocation;
    const result = await bootstrapNpm({
      dependencies: {
        download: async (destination) => writeFile(destination, fixture.bytes),
        expectedSri: sri(fixture.bytes),
        containment: fixtureContainment(root),
        spawn: (command, args, options) => {
          if (command !== "tar") invocation = { args, command, options };
          return spawn(command, args, options);
        },
      },
      root,
      timeoutMs: 456,
    });
    assert.equal(result.code, "NPM_BOOTSTRAP_INSTALL");
    assert.equal(invocation.command, "/bin/sh");
    assert.equal(invocation.args[2], "coco-npm");
    assert.equal(invocation.args[3], process.execPath);
    assert.deepEqual(invocation.args.slice(5), ["install", "--ignore-scripts", "--package-lock=true", "--save-exact"]);
    assert.equal(invocation.options.cwd, root);
  });
});

test("Given real cgroup containment is unavailable, when bootstrap uses its injected containment, then the fixture spawn still reaches INSTALL", async () => {
  await withFixture(async (root) => {
    const fixture = await archive(root, `${installScript} require("node:fs").writeFileSync("spawned", "yes"); process.exit(1);`);
    const group = join(root, "containment");
    const calls = [];
    const result = await bootstrapNpm({
      dependencies: {
        containment: {
          create: async () => {
            calls.push("create");
            await mkdir(group);
            await writeFile(join(group, "cgroup.procs"), "");
            return group;
          },
          kill: async () => {
            calls.push("kill");
          },
          pids: async () => {
            calls.push("pids");
            return [];
          },
          remove: async () => {
            calls.push("remove");
            await rm(group, { force: true, recursive: true });
          },
        },
        download: async (destination) => writeFile(destination, fixture.bytes),
        expectedSri: sri(fixture.bytes),
      },
      root,
    });
    assert.equal(result.code, "NPM_BOOTSTRAP_INSTALL");
    assert.equal(await readFile(join(root, "spawned"), "utf8"), "yes");
    assert.deepEqual(calls, ["create", "kill", "pids", "remove"]);
  });
});

test("Given containment setup fails, when bootstrap installs, then it fails closed before fixture spawn", async () => {
  await withFixture(async (root) => {
    const fixture = await archive(root, `${installScript} require("node:fs").writeFileSync("spawned", "yes");`);
    const result = await bootstrapNpm({
      dependencies: {
        containment: { create: async () => { throw new Error("unavailable"); } },
        download: async (destination) => writeFile(destination, fixture.bytes),
        expectedSri: sri(fixture.bytes),
      },
      root,
    });
    assert.equal(result.code, "NPM_BOOTSTRAP_SPAWN");
    await absent(join(root, "spawned"));
    await absent(join(root, "package-lock.json"));
    await absent(join(root, "node_modules"));
  });
});

test("Given a TERM-ignoring process tree, when installation times out, then TERM and KILL reap it before cleanup", async () => {
  await withFixture(async (root) => {
    const detached = "const { spawn } = require('node:child_process');const { writeFileSync } = require('node:fs');const { join } = require('node:path');const child = spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)\"],{detached:true,stdio:'ignore'});child.unref();writeFileSync(join(process.cwd(),'pids'),JSON.stringify([Number(process.env.PARENT_PID),Number(process.env.CHILD_PID),child.pid]));";
    const source = `${installScript}
      const { spawn } = require("node:child_process");
      const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"]);
      const grandchild = ${JSON.stringify(detached)};
      spawn(process.execPath, ["-e", grandchild], { detached: true, env: { ...process.env, PARENT_PID: String(process.pid), CHILD_PID: String(child.pid) }, stdio: "ignore" }).unref();
      process.on("SIGTERM", () => {});
      setInterval(() => {}, 1000);
    `;
    const fixture = await archive(root, source);
    const bootstrapping = bootstrapNpm({
      dependencies: {
        containment: fixtureContainment(root, async () => {
          for (const pid of JSON.parse(await waitForFile(join(root, "pids")))) if (!dead(pid)) process.kill(pid, "SIGKILL");
        }),
        download: async (destination) => writeFile(destination, fixture.bytes),
        expectedSri: sri(fixture.bytes),
      },
      root,
      timeoutMs: 1_000,
    });
    const pids = JSON.parse(await waitForFile(join(root, "pids")));
    const result = await bootstrapping;
    assert.equal(result.code, "NPM_BOOTSTRAP_TIMEOUT");
    for (const pid of pids) assert.equal(await waitForTermination(pid), true);
    await absent(join(root, "package-lock.json"));
    await absent(join(root, "node_modules"));
  });
});

test("Given an installer that exits during TERM grace, when installation times out, then it returns promptly without a lingering timer", async () => {
  await withFixture(async (root) => {
    const fixture = await archive(root, `${installScript} process.on("SIGTERM", () => process.exit(0)); setInterval(() => {}, 1000);`);
    const started = Date.now();
    const result = await bootstrapNpm({ dependencies: { containment: fixtureContainment(root), download: async (destination) => writeFile(destination, fixture.bytes), expectedSri: sri(fixture.bytes) }, root, timeoutMs: 200 });
    assert.equal(result.code, "NPM_BOOTSTRAP_TIMEOUT");
    assert.ok(Date.now() - started < 1_000);
    await absent(join(root, "package-lock.json"));
    await absent(join(root, "node_modules"));
  });
});

test("Given existing node_modules, when a generated install fails, then cleanup preserves its bytes", async () => {
  await withFixture(async (root) => {
    const existing = join(root, "node_modules", "preserve.txt");
    await mkdir(join(root, "node_modules"), { recursive: true });
    await writeFile(existing, "existing\n");
    const fixture = await archive(root, `${installScript} process.exit(1);`);
    const result = await bootstrapNpm({ dependencies: { containment: fixtureContainment(root), download: async (destination) => writeFile(destination, fixture.bytes), expectedSri: sri(fixture.bytes) }, root });
    assert.equal(result.code, "NPM_BOOTSTRAP_INSTALL");
    assert.equal(await readFile(existing, "utf8"), "existing\n");
    await absent(join(root, "package-lock.json"));
  });
});

test("Given a preexisting lock, when bootstrap is invoked, then it preserves its exact bytes", async () => {
  await withFixture(async (root) => {
    const lock = join(root, "package-lock.json");
    await writeFile(lock, "keep-these-bytes\n");
    const result = await bootstrapNpm({ root });
    assert.equal(result.code, "BOOTSTRAP_LOCK_CONFLICT");
    assert.equal(await readFile(lock, "utf8"), "keep-these-bytes\n");
  });
});
