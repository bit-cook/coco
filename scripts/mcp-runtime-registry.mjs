import { createMcpPublisher } from "./mcp-config.mjs";

// Keep reloads ordered so an older candidate cannot publish after a newer one.
export function createMcpRuntimeRegistry(options) {
  const publisher = createMcpPublisher(options);
  let current = publisher.current();
  let pending = Promise.resolve();

  const reload = (change) => {
    const operation = pending.then(async () => {
      const next = await publisher.reload(change);
      current = next;
      return next;
    });
    pending = operation.catch(() => {});
    return operation;
  };

  return Object.freeze({
    current: () => current,
    tools: () => current.tools,
    reload,
  });
}
