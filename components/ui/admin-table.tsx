import { ReactNode } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

// Defines how each column should render its header and cell
export interface ColumnDef<T> {
  header: ReactNode;
  accessorKey?: keyof T;
  cell?: (item: T) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
}

interface AdminTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
}

export function AdminTable<T>({
  columns,
  data,
  keyExtractor,
}: AdminTableProps<T>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((col, idx) => (
            <TableHead key={idx} className={col.headerClassName}>
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item) => (
          <TableRow key={keyExtractor(item)}>
            {columns.map((col, idx) => (
              <TableCell key={idx} className={col.cellClassName}>
                {col.cell
                  ? col.cell(item)
                  : col.accessorKey && item[col.accessorKey] != null
                    ? String(item[col.accessorKey])
                    : ""}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
