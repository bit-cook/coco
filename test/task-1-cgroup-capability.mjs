import { access, mkdir, readFile, rmdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";

export async function hasWritableCgroupV2() {
  try {
    if ((await readFile("/sys/fs/cgroup/cgroup.controllers", "utf8")).trim() === "") return false;
    await access("/sys/fs/cgroup", constants.W_OK);
    const group = `/sys/fs/cgroup/coco-test-capability-${randomUUID()}`;
    await mkdir(group);
    await rmdir(group);
    return true;
  } catch {
    return false;
  }
}
