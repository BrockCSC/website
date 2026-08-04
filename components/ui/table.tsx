import * as React from "react";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Badge, badgeVariants } from "@/components/ui/badge";

export type TableColumn = {
  key: string;
  label: string;
};

export type BadgeCell = {
  type: "badge";
  label: string;
  variant?: VariantProps<typeof badgeVariants>["variant"];
};

export type TableCellValue = string | number | BadgeCell;

export type TableData = {
  columns: TableColumn[];
  rows: Record<string, TableCellValue>[];
};

type TableProps = React.HTMLAttributes<HTMLTableElement> & {
  containerClassName?: string;
  containerStyle?: React.CSSProperties;

  // Optional JSON mode: render from data instead of children.
  data?: TableData;

  // "stack" renders cards on mobile instead of a scrolling table.
  mobileVariant?: "scroll" | "stack";
};

function renderCell(value: TableCellValue): React.ReactNode {
  if (typeof value === "object") {
    return <Badge variant={value.variant || "default"}>{value.label}</Badge>;
  }
  return value;
}

const tableDefaults = {
  "--table-border": "#000000",
  "--table-head-bg": "#f2f2f2",
  "--table-divider": "#000000",
  "--table-hover": "#f2f2f2",
  "--table-shadow": "4px 4px 0 #000",
  "--table-radius": "20px",
  "--table-text": "#111111",
  "--table-head-text": "#111111",
  "--table-caption": "#111111",
  "--table-bg": "#ffffff",
} as React.CSSProperties;

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  (
    {
      className,
      containerClassName,
      containerStyle,
      data,
      mobileVariant = "scroll",
      children,
      ...props
    },
    ref,
  ) => {
    const isStack = mobileVariant === "stack" && data;

    return (
      <div
        className={cn(
          "relative w-full rounded-[var(--table-radius)] border-2 border-[color:var(--table-border)] bg-[color:var(--table-bg)] shadow-[var(--table-shadow)] overflow-hidden",
          mobileVariant === "scroll" && "overflow-x-auto",
          containerClassName,
        )}
        style={{ ...tableDefaults, ...containerStyle }}
      >
        {isStack ? (
          <div className="md:hidden flex flex-col gap-4 p-4">
            {data.rows.map((row, i) => (
              <div
                key={i}
                className="border-2 border-[color:var(--table-border)] rounded-xl p-4 shadow-[2px_2px_0_#000]"
              >
                {data.columns.map((col) => (
                  <div key={col.key} className="flex justify-between py-1">
                    <span className="font-semibold">{col.label}</span>
                    <span>{renderCell(row[col.key])}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}

        <table
          ref={ref}
          className={cn(
            "w-full caption-bottom text-base text-[color:var(--table-text)]",
            isStack ? "hidden md:table" : "",
            className,
          )}
          {...props}
        >
          {data ? (
            <>
              <thead className="bg-[color:var(--table-head-bg)]">
                <tr className="border-b-2 border-[color:var(--table-border)]">
                  {data.columns.map((col) => (
                    <th
                      key={col.key}
                      className="h-12 px-6 text-left font-semibold"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-[color:var(--table-divider)] hover:bg-[color:var(--table-hover)]"
                  >
                    {data.columns.map((col) => (
                      <td key={col.key} className="p-4">
                        {renderCell(row[col.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </>
          ) : (
            children
          )}
        </table>
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "bg-[color:var(--table-head-bg)] [&_tr]:border-b-2 [&_tr]:border-[color:var(--table-border)]",
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t-2 border-[color:var(--table-border)] bg-[color:var(--table-head-bg)] font-semibold [&>tr]:last:border-b-0",
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-[color:var(--table-divider)] transition-colors hover:bg-[color:var(--table-hover)]",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-6 text-left align-middle font-semibold text-[color:var(--table-head-text)] [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-4 align-middle text-[color:var(--table-text)] [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn(
      "mt-4 text-sm text-[color:var(--table-caption)] opacity-70",
      className,
    )}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
