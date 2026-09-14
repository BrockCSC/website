let started = false;

export async function register() {
  if (started || process.env.NEXT_RUNTIME !== "nodejs") return;
  started = true;
  const { startRetirementSweep } = await import("@/lib/mail/retirement-sweep");
  startRetirementSweep();
}
