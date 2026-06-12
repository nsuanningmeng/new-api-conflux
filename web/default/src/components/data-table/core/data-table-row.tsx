import type * as React from 'react'
import { flexRender, type Row } from '@tanstack/react-table'
import { TableCell, TableRow } from '@/components/ui/table'
import type { DataTableColumnClassName } from './types'

type DataTableRowProps<TData> = {
  row: Row<TData>
  className?: string
  getColumnClassName?: DataTableColumnClassName
} & Omit<React.ComponentProps<typeof TableRow>, 'children'>

export function DataTableRow<TData>({
  row,
  className,
  getColumnClassName,
  ...rowProps
}: DataTableRowProps<TData>) {
  return (
    <TableRow
      data-state={row.getIsSelected() ? 'selected' : undefined}
      className={className}
      {...rowProps}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell
          key={cell.id}
          className={getColumnClassName?.(cell.column.id, 'cell')}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  )
}
