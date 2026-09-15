import type { ExecRecord } from "@/lib/api/types";
import { fillMissingTerms } from "@/lib/db/execs";
import { findAll } from "@/lib/db/repository";
import { execsTable } from "@/lib/db/schema";
import { isValidTerm, storedTerms } from "./terms";

/** `term`/`terms` holding the wrong JSON type. The stamp skips these rather than overwrite them, so nothing else ever repairs them. */
const badType = (exec: ExecRecord) =>
  (exec.terms !== undefined &&
    (!Array.isArray(exec.terms) ||
      exec.terms.some((t) => typeof t !== "string"))) ||
  (exec.term !== undefined &&
    exec.term !== null &&
    typeof exec.term !== "string");

const unlisted = (exec: ExecRecord) =>
  storedTerms(exec).some((term) => !isValidTerm(term));

/**
 * Gives current tiles with no term the one they're serving, once per boot. Unlike the
 * retirement sweep it runs outside prod too: it writes only this schema's tiles, and a
 * preview's copy of prod is replaced on the next deploy anyway.
 */
export const backfillTerms = async (): Promise<void> => {
  try {
    const filled = await fillMissingTerms();
    if (filled.length) {
      console.log(
        `term backfill: filled ${filled.length} tile(s): ${filled.join(", ")}`,
      );
    }
    // Nothing can inspect prod data from a dev box, so say once what's on file that the picker won't offer.
    const tiles = await findAll<ExecRecord>(execsTable);
    const ids = (list: { id: string }[]) =>
      list.map((exec) => exec.id).join(", ");
    const malformed = tiles.filter(badType);
    if (malformed.length) {
      console.warn(
        `term backfill: ${malformed.length} tile(s) store term/terms as the wrong JSON type and were skipped: ${ids(malformed)}`,
      );
    }
    const strange = tiles.filter((exec) => !badType(exec) && unlisted(exec));
    if (strange.length) {
      console.warn(
        `term backfill: ${strange.length} tile(s) hold a term that isn't a listed academic year: ${ids(strange)}`,
      );
    }
  } catch (err) {
    console.error(`term backfill: ${err instanceof Error ? err.message : err}`);
  }
};
