/** Runs once per server start: the retired-username sweep and stale-migration resume. */
export const register = async () => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startIdentityMaintenance } =
    await import("@/lib/identity/maintenance");
  startIdentityMaintenance();
};
