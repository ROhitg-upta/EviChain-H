"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Checkbox } from "./choice";
import { cn } from "./utils";

export type DataTableColumn<T> = {
  key: keyof T | string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  className?: string;
};

export type DataTableProps<T extends { id: string }> = {
  rows: T[];
  columns: DataTableColumn<T>[];
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  pageSize?: number;
  emptyState?: ReactNode;
  getRowLabel?: (row: T) => string;
};

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  selectedIds = [],
  onSelectionChange,
  pageSize = 10,
  emptyState = "No records found.",
  getRowLabel,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const column = columns.find((item) => String(item.key) === sortKey);
    if (!column) return rows;
    return [...rows].sort((a, b) => {
      const av = column.sortValue?.(a) ?? String((a as Record<string, unknown>)[sortKey] ?? "");
      const bv = column.sortValue?.(b) ?? String((b as Record<string, unknown>)[sortKey] ?? "");
      const order = av > bv ? 1 : av < bv ? -1 : 0;
      return sortDir === "asc" ? order : -order;
    });
  }, [columns, rows, sortDir, sortKey]);

  const pages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const visibleRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedIds.includes(row.id));

  function toggleSort(key: string) {
    setPage(1);
    if (sortKey === key) {
      setSortDir((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  function toggleVisibleRows(checked: boolean) {
    if (!onSelectionChange) return;
    const visibleIds = visibleRows.map((row) => row.id);
    onSelectionChange(
      checked
        ? Array.from(new Set([...selectedIds, ...visibleIds]))
        : selectedIds.filter((id) => !visibleIds.includes(id)),
    );
  }

  function toggleRow(id: string, checked: boolean) {
    if (!onSelectionChange) return;
    onSelectionChange(checked ? [...selectedIds, id] : selectedIds.filter((item) => item !== id));
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr>
              {onSelectionChange && (
                <th className="w-12 px-4 py-3 text-left">
                  <Checkbox label="Select visible rows" className="border-0 bg-transparent p-0" checked={allVisibleSelected} onChange={(event) => toggleVisibleRows(event.target.checked)} />
                </th>
              )}
              {columns.map((column) => {
                const key = String(column.key);
                return (
                  <th key={key} className={cn("px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500", column.className)}>
                    {column.sortable ? (
                      <button type="button" className="inline-flex items-center gap-1 hover:text-slate-950 dark:hover:text-slate-50" onClick={() => toggleSort(key)}>
                        {column.header}
                        <span aria-hidden="true">{sortKey === key ? (sortDir === "asc" ? "up" : "down") : "sort"}</span>
                      </button>
                    ) : column.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (onSelectionChange ? 1 : 0)} className="px-4 py-10 text-center text-sm text-slate-500">
                  {emptyState}
                </td>
              </tr>
            ) : visibleRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 transition hover:bg-emerald-50/50 dark:border-slate-800 dark:hover:bg-slate-900" aria-label={getRowLabel?.(row)}>
                {onSelectionChange && (
                  <td className="px-4 py-3">
                    <Checkbox label={`Select ${getRowLabel?.(row) ?? row.id}`} className="border-0 bg-transparent p-0" checked={selectedIds.includes(row.id)} onChange={(event) => toggleRow(row.id, event.target.checked)} />
                  </td>
                )}
                {columns.map((column) => (
                  <td key={String(column.key)} className={cn("px-4 py-3 text-sm text-slate-700 dark:text-slate-200", column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800">
        <span>{sortedRows.length} rows · page {page} of {pages}</span>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
          <Button type="button" variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((current) => Math.min(pages, current + 1))}>Next</Button>
        </div>
      </footer>
    </div>
  );
}
