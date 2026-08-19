function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function uniqueClients(generation) {
  return [...new Set(generation.tools.map(({ client }) => client))];
}

async function closeGeneration(generation) {
  await Promise.allSettled(uniqueClients(generation).map((client) => typeof client?.close === "function" ? client.close() : undefined));
}

function prepareGeneration(generation) {
  if (!generation || !Number.isSafeInteger(generation.generation) || generation.generation < 0 || !Array.isArray(generation.tools)) fail("MCP_EXTENSION_GENERATION_INVALID");
  const names = new Set();
  const tools = generation.tools.map((entry) => {
    const tool = entry?.prepared;
    if (!tool || typeof tool !== "object" || typeof tool.name !== "string" || tool.name.length === 0 || names.has(tool.name)) fail("MCP_EXTENSION_TOOL_INVALID");
    names.add(tool.name);
    return Object.freeze({ ...tool });
  });
  return Object.freeze(tools);
}

export function createMcpExtensionAdapter({ registry }) {
  if (!registry || typeof registry.reload !== "function") fail("MCP_EXTENSION_REGISTRY_INVALID");

  return function mcpExtension(host) {
    if (!host || typeof host.on !== "function") fail("MCP_EXTENSION_HOST_INVALID");
    const atomic = typeof host.registerGeneration === "function";
    const unregister = typeof host.unregisterTool === "function" ? host.unregisterTool.bind(host) : typeof host.unregister === "function" ? host.unregister.bind(host) : undefined;
    const rollback = typeof host.rollbackGeneration === "function" ? host.rollbackGeneration.bind(host) : typeof host.rollback === "function" ? host.rollback.bind(host) : undefined;
    if (!atomic && (typeof host.registerTool !== "function" || (!unregister && !rollback))) fail("MCP_EXTENSION_TRANSACTION_UNSUPPORTED");

    let active;
    let dispose;
    let pending = Promise.resolve();

    const publish = async () => {
      const generation = await registry.reload();
      let tools;
      try {
        tools = prepareGeneration(generation);
        if (atomic) {
          const result = await host.registerGeneration(tools, { generation: generation.generation });
          dispose = typeof result === "function" ? result : typeof result?.dispose === "function" ? result.dispose.bind(result) : undefined;
        } else {
          const registered = [];
          try {
            for (const tool of tools) {
              registered.push(tool.name);
              await host.registerTool(tool);
            }
          } catch (error) {
            if (rollback) await rollback({ generation: generation.generation, registered: Object.freeze([...registered]) });
            else await Promise.allSettled(registered.reverse().map((name) => unregister(name)));
            throw error;
          }
          dispose = rollback
            ? () => rollback({ generation: generation.generation, registered: Object.freeze([...registered]) })
            : async () => { await Promise.allSettled([...registered].reverse().map((name) => unregister(name))); };
        }
        active = generation;
      } catch (error) {
        await closeGeneration(generation);
        throw error;
      }
      return generation;
    };

    const shutdown = async () => {
      try { await dispose?.(); } finally {
        dispose = undefined;
        if (active) await closeGeneration(active);
        active = undefined;
      }
    };

    host.on("session_start", () => {
      const operation = pending.then(publish);
      pending = operation.catch(() => {});
      return operation;
    });
    host.on("session_shutdown", () => {
      const operation = pending.then(shutdown);
      pending = operation.catch(() => {});
      return operation;
    });
  };
}
