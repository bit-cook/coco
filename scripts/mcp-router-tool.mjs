function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function content(result) {
  const parts = Array.isArray(result?.content) ? result.content : [];
  return parts.map((part) => part?.type === "text"
    ? { type: "text", text: String(part.text ?? "") }
    : part?.type === "image"
      ? { type: "image", data: part.data, mimeType: part.mimeType }
      : { type: "text", text: JSON.stringify(part) });
}

export function createMcpRouterTool({ journal, registry }) {
  if (!registry || typeof registry.current !== "function") fail("MCP_ROUTER_REGISTRY_INVALID");
  const fence = journal ? createDurableEffectFence({ journal }) : null;
  return Object.freeze({
    description: "Call one tool from the current verified MCP generation.",
    label: "MCP",
    name: "mcp",
    parameters: Object.freeze({
      type: "object",
      additionalProperties: false,
      properties: {
        arguments: { type: "object", additionalProperties: true },
        server: { type: "string", minLength: 1 },
        tool: { type: "string", minLength: 1 },
      },
      required: ["server", "tool", "arguments"],
    }),
    async execute(_id, input, signal) {
      const generation = registry.current();
      const entry = generation.tools.find(({ serverName, tool }) => serverName === input?.server && tool.name === input?.tool);
      if (!entry) fail("MCP_TOOL_NOT_FOUND");
      const invoke = () => entry.client.callTool({ arguments: input.arguments, name: entry.tool.name }, undefined, { signal });
      let result;
      if (fence) {
        try { result = (await fence.run({ commandId: _id, effect: invoke, effectGeneration: generation.generation, operationId: "mcp.tool.call", request: { arguments: input.arguments, server: input.server, tool: input.tool } })).response; }
        catch (error) { if (error?.message === "COMMAND_DIGEST_CONFLICT") fail("MCP_COMMAND_CONFLICT"); if (error?.code === "DURABLE_EFFECT_UNCERTAIN") fail("MCP_OUTCOME_UNCERTAIN"); if (error?.code === "DURABLE_EFFECT_IN_PROGRESS") fail("MCP_COMMAND_IN_PROGRESS"); throw error; }
      } else result = await invoke();
      return { content: content(result), details: { generation: generation.generation, server: entry.serverName, tool: entry.tool.name }, isError: result?.isError === true };
    },
  });
}
import { createDurableEffectFence } from "./durable-effect-fence.mjs";
