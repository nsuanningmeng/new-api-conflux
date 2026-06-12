import type { Table as TanstackTable } from '@tanstack/react-table'

export function DataTableColgroup<TData>({
  table,
}: {
  table: TanstackTable<TData>
}) {
  return (
    <colgroup>
      {table.getVisibleLeafColumns().map((column) => (
        <col key={column.id} style={{ width: column.getSize() }} />
      ))}
    </colgroup>
  )
}
