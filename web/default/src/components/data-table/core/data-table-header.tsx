import { flexRender, type Table as TanstackTable } from '@tanstack/react-table'
import { TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { DataTableColumnClassName } from './types'

type DataTableHeaderProps<TData> = {
  table: TanstackTable<TData>
  applyHeaderSize?: boolean
  className?: string
  rowClassName?: string
  getColumnClassName?: DataTableColumnClassName
}

export function DataTableHeader<TData>({
  table,
  applyHeaderSize,
  className,
  rowClassName,
  getColumnClassName,
}: DataTableHeaderProps<TData>) {
  return (
    <TableHeader className={className}>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id} className={rowClassName}>
          {headerGroup.headers.map((header) => (
            <TableHead
              key={header.id}
              colSpan={header.colSpan}
              className={getColumnClassName?.(header.column.id, 'header')}
              style={applyHeaderSize ? { width: header.getSize() } : undefined}
            >
              {header.isPlaceholder
                ? null
                : flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
            </TableHead>
          ))}
        </TableRow>
      ))}
    </TableHeader>
  )
}
