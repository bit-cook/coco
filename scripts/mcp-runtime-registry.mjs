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

  const close = () => {
    const operation = pending.then(async () => {
      const clients = [...new Set(current.tools.map(({ client }) => client))];
      await Promise.allSettled(clients.map((client) => typeof client?.close === "function" ? client.close() : undefined));
      current = Object.freeze({ ...current, tools: Object.freeze([]) });
    });
    pending = operation.catch(() => {});
    return operation;
  };

  return Object.freeze({
    close,
    current: () => current,
    tools: () => current.tools,
    reload,
  });
}
