export function requiredLoopbackOrigin(value) {
  const origin = new URL(value);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.port === "") throw new Error("F3_ORIGIN_INVALID");
  return origin.origin;
}
