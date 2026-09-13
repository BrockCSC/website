/**
 * instrumentation.ts and the route handlers are bundled as separate module
 * graphs, so a plain module-level variable exists twice in one process.
 * State that must be seen by both (the runner registry, the password vault,
 * the preflight result) lives on globalThis instead.
 */
export const shared = <T>(key: string, make: () => T): T => {
  const store = globalThis as unknown as Record<string, T | undefined>;
  return (store[key] ??= make());
};
