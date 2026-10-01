import * as React from "react";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Badge, badgeVariants } from "@/components/ui/badge";

type TableColumn = {
  key: string;
  label: string;
};

type BadgeCell = {
  type: "badge";
  label: string;
  variant?: VariantProps<typeof badgeVariants>["variant"];
};

type TableCellValue = string | number | BadgeCell;

export type TableData = {
  columns: TableColumn[];
  rows: Record<string, TableCellValue>[];
};

type TableProps = React.HTMLAttributes<HTMLTableElement> & {
  data: TableData;
  mobileVariant?: "scroll" | "stack";
};

const renderCell = (value: TableCellValue): React.ReactNode =>
  typeof value === "object" ? (
    <Badge variant={value.variant || "default"}>{value.label}</Badge>
  ) : (
    value
  );

const tableDefaults = {
  "--table-border": "var(--line)",
  "--table-head-bg": "var(--raised)",
  "--table-divider": "var(--line)",
  "--table-hover": "var(--tint)",
  "--table-shadow": "4px 4px 0 var(--shade)",
  "--table-radius": "20px",
  "--table-text": "var(--ink)",
  "--table-bg": "var(--surface)",
} as React.CSSProperties;

export const Table = ({
  className,
  data,
  mobileVariant = "scroll",
  ...props
}: TableProps) => {
  const isStack = mobileVariant === "stack";

  return (
    <div
      className={cn(
        "relative w-full rounded-[var(--table-radius)] border-2 border-[color:var(--table-border)] bg-[color:var(--table-bg)] shadow-[var(--table-shadow)] overflow-hidden",
        mobileVariant === "scroll" && "overflow-x-auto",
        // Stacked: below md each row is its own card, so the wrapper drops
        // its chrome (public-12).
        isStack &&
          "max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none",
      )}
      style={tableDefaults}
    >
      {isStack ? (
        <div className="md:hidden flex flex-col gap-4">
          {data.rows.map((row, i) => (
            <div
              key={i}
              className="border-2 border-[color:var(--table-border)] rounded-xl p-4 shadow-brut-sm"
            >
              {data.columns.map((col) => (
                <div
                  key={col.key}
                  className="flex flex-col gap-0.5 py-1 min-[420px]:flex-row min-[420px]:justify-between min-[420px]:gap-3"
                >
                  <span className="font-semibold">{col.label}</span>
                  <span className="min-w-0 min-[420px]:text-right">
                    {renderCell(row[col.key])}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      <table
        className={cn(
          "w-full caption-bottom text-base text-[color:var(--table-text)]",
          isStack ? "hidden md:table" : "",
          className,
        )}
        {...props}
      >
        <thead className="bg-[color:var(--table-head-bg)]">
          <tr className="border-b-2 border-[color:var(--table-border)]">
            {data.columns.map((col) => (
              <th key={col.key} className="h-12 px-6 text-left font-semibold">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-[color:var(--table-divider)] transition-colors duration-[var(--dur-fast)] ease-smooth hover:bg-[color:var(--table-hover)]"
            >
              {data.columns.map((col) => (
                <td key={col.key} className="p-4">
                  {renderCell(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
