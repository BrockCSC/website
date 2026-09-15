import type { ExportContext, ExportReport } from "../types";
import { accessRemovalReport } from "./access-removal";
import { accessRequestReport } from "./access-request";
import { eventsReport } from "./events-report";
import { executiveRosterReport } from "./executive-roster";
import { officersConfirmationReport } from "./officers-confirmation";
import { signingRegisterReport } from "./signing-register";

/** Hides each report's data type behind `build`, so reports with different shapes share one list. */
const register = <Data>({
  load,
  preview,
  render,
  ...meta
}: ExportReport<Data>) => ({
  ...meta,
  build: async (ctx: ExportContext) => {
    const data = await load(ctx);
    return { preview: preview(data, ctx), render: () => render(data, ctx) };
  },
});

/** In the order the exports page shows them. */
export const EXPORT_REPORTS = [
  register(accessRequestReport),
  register(accessRemovalReport),
  register(executiveRosterReport),
  register(officersConfirmationReport),
  register(eventsReport),
  register(signingRegisterReport),
];

export const findExportReport = (id: string) =>
  EXPORT_REPORTS.find((report) => report.id === id) ?? null;
