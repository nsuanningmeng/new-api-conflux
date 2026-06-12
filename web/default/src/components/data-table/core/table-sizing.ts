import type * as React from 'react'
import type { Table as TanstackTable } from '@tanstack/react-table'

export function getTableSizeStyle<TData>(
  table: TanstackTable<TData>
): React.CSSProperties {
  const width = table
    .getVisibleLeafColumns()
    .reduce((total, column) => total + column.getSize(), 0)

  return { minWidth: width, tableLayout: 'fixed', width: '100%' }
}
