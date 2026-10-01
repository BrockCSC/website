// Screen-reader announcements through visually hidden live regions, created on
// first use. Safe to import anywhere; a no-op on the server.
//
// While a modal <dialog> is open, everything outside it is inert and its live
// regions go quiet, so the region lives inside the topmost open dialog then.

type Politeness = "polite" | "assertive";

const regions = new WeakMap<
  Element,
  Partial<Record<Politeness, HTMLElement>>
>();

const HIDDEN =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";

function regionFor(politeness: Politeness) {
  const dialogs = document.querySelectorAll("dialog[open]");
  const host = dialogs[dialogs.length - 1] ?? document.body;
  const byPoliteness = regions.get(host) ?? {};
  let region = byPoliteness[politeness];
  if (!region || !region.isConnected) {
    region = document.createElement("div");
    region.setAttribute("aria-live", politeness);
    region.setAttribute("aria-atomic", "true");
    region.setAttribute("data-announcer", politeness);
    region.style.cssText = HIDDEN;
    host.appendChild(region);
    byPoliteness[politeness] = region;
    regions.set(host, byPoliteness);
  }
  return region;
}

export function announce(text: string, politeness: Politeness = "polite") {
  if (typeof document === "undefined") return;
  const region = regionFor(politeness);
  // Clear, then set on the next frame, so repeating a message is read again.
  region.textContent = "";
  requestAnimationFrame(() => {
    region.textContent = text;
  });
}
