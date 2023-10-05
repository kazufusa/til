import { ConnectableElement, useDrop, useDrag } from "react-dnd";
import {
  Column,
  Header,
  Table,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  getCoreRowModel,
  ColumnOrderState,
  ColumnPinningState,
  SortingState,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import React from "react";

type ValueWithMemo = {
  value?: number;
  memo: string;
};

type Enum = "A" | "B" | "C";

type Data = {
  id: string;
  enumValue: Enum;
  nullableRatio?: number;
  valueWithMemo: ValueWithMemo;
};

const data: Data[] = [
  {
    id: "1",
    enumValue: "A",
    nullableRatio: 0.5,
    valueWithMemo: { memo: "lower than background" },
  },
  { id: "2", enumValue: "A", valueWithMemo: { memo: "-" } },
  {
    id: "3",
    enumValue: "B",
    nullableRatio: 0.7112,
    valueWithMemo: { value: 2, memo: "Found" },
  },
  {
    id: "4",
    enumValue: "B",
    nullableRatio: 0.7112,
    valueWithMemo: { value: 3, memo: "" },
  },
  {
    id: "5",
    enumValue: "C",
    nullableRatio: 0,
    valueWithMemo: { value: 4, memo: "" },
  },
];

const ratioFormatter = new Intl.NumberFormat("ja-JP", {
  style: "percent",
  minimumFractionDigits: 1,
});

const columnHelper = createColumnHelper<Data>();

export const columns = [
  columnHelper.accessor("id", {
    header: "id",
    cell: (props) => props.getValue(),
    size: 100,
  }),
  columnHelper.accessor("enumValue", {
    header: "enumValue",
    cell: (props) => props.getValue(),
    size: 200,
  }),
  columnHelper.accessor("nullableRatio", {
    header: "nullableRatio",
    cell: (props) => {
      const value = props.getValue();
      return value !== undefined ? ratioFormatter.format(value) : "-";
    },
    size: 200,
    sortUndefined: -1,
  }),
  columnHelper.accessor("valueWithMemo", {
    header: "valueWithMemo",
    cell: (props) => props.getValue().value ?? props.getValue().memo,
    size: 200,
    sortingFn: (rowA, rowB, columnId: string) => {
      const { value: va, memo: ma } = rowA.getValue(
        "valueWithMemo",
      ) as Data["valueWithMemo"];
      const { value: vb, memo: mb } = rowB.getValue(
        "valueWithMemo",
      ) as Data["valueWithMemo"];
      if (va !== undefined && vb === undefined) return -1;
      else if (va === undefined && vb !== undefined) return -1;
      else if (va !== undefined && vb !== undefined)
        return va < vb ? 1 : va > vb ? -1 : 0;
      else return ma < mb ? 1 : ma > mb ? -1 : 0;
    },
  }),
];

function reorderColumn(
  draggedColumnId: string,
  targetColumnId: string,
  columnOrder: string[],
): ColumnOrderState {
  columnOrder.splice(
    columnOrder.indexOf(targetColumnId),
    0,
    columnOrder.splice(columnOrder.indexOf(draggedColumnId), 1)[0] as string,
  );
  return [...columnOrder];
}

function MyTh({
  header,
  table,
  children,
}: {
  header: Header<Data, unknown>;
  table: Table<Data>;
  children: React.ReactNode;
}) {
  const { getState, setColumnOrder } = table;
  const { columnOrder } = getState();
  const { column } = header;

  const [, dropRef] = useDrop({
    accept: "column", // unique key in app
    drop: (draggedColumn: Column<Data>) => {
      const newColumnOrder = reorderColumn(
        draggedColumn.id,
        column.id,
        columnOrder,
      );
      setColumnOrder(newColumnOrder);
    },
  });

  const [{ isDragging }, dragRef] = useDrag({
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    item: () => column,
    type: "column",
  });

  function attachRef(el: ConnectableElement) {
    dragRef(el);
    dropRef(el);
  }

  return (
    <div
      className={`th ${header.column.getIsPinned() && "pinned"}`}
      ref={header.column.getIsPinned() ? null : attachRef}
      style={{
        opacity: isDragging ? 0.5 : 1,
        width: header.getSize(),
        left:
          column.getIsPinned() === "left"
            ? `${column.getStart("left")}px`
            : undefined,
        right:
          column.getIsPinned() === "right"
            ? `${getTotalRight<Data>(table, column)}px`
            : undefined,
      }}
      draggable={!table.getState().columnSizingInfo.isResizingColumn}
    >
      {children}
    </div>
  );
}

function getTotalRight<TData extends Record<string, any>>(
  table: Table<TData>,
  column: Column<TData, unknown>,
) {
  return table
    .getRightLeafHeaders()
    .slice(column.getPinnedIndex() + 1)
    .reduce((acc, col) => acc + col.getSize(), 0);
}

export function Table() {
  const [columnOrder, setColumnOrder] = React.useState<ColumnOrderState>(
    columns.map((column) => column.header as string),
  );
  const [columnPinning, setColumnPinning] = React.useState<ColumnPinningState>({
    left: ["id"],
  });
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    state: {
      columnOrder,
      columnPinning,
      sorting,
    },
    onColumnOrderChange: setColumnOrder,
    onColumnPinningChange: setColumnPinning,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: "onChange",
    debugTable: true,
    debugHeaders: true,
    debugColumns: true,
  });

  return (
    <>
      <div className="table">
        <div className="thead">
          {table.getHeaderGroups().map((headerGroup) => (
            <div className="tr" key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <MyTh key={header.id} header={header} table={table}>
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  <button
                    className="pin"
                    onClick={() =>
                      header.column.pin(
                        header.column.getIsPinned() === "left" ? false : "left",
                      )
                    }
                  >
                    {header.column.getIsPinned() === "left" ? "x" : "<<"}
                  </button>
                  <button
                    className="pin"
                    onClick={() =>
                      header.column.pin(
                        header.column.getIsPinned() === "right"
                          ? false
                          : "right",
                      )
                    }
                  >
                    {header.column.getIsPinned() === "right" ? "x" : ">>"}
                  </button>
                  <div
                    {...{
                      onMouseDown: (e) => {
                        e.preventDefault();
                        header.getResizeHandler()(e);
                      },
                      onTouchStart: (e) => {
                        e.preventDefault();
                        header.getResizeHandler()(e);
                      },
                      className: `resizer ${
                        header.column.getIsResizing() ? "isResizing" : ""
                      }`,
                    }}
                  />
                  <button
                    className="pin"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {header.column.getIsSorted() === "asc"
                      ? "↑"
                      : header.column.getIsSorted() === "desc"
                      ? "↓"
                      : "⇅"}
                  </button>
                </MyTh>
              ))}
            </div>
          ))}
        </div>
        <div className="tbody">
          {table.getRowModel().rows.map((row) => (
            <div className="tr" key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <div
                  className={`td ${cell.column.getIsPinned() && "pinned"}`}
                  key={cell.id}
                  style={{
                    width: cell.column.getSize(),
                    left:
                      cell.column.getIsPinned() === "left"
                        ? `${cell.column.getStart("left")}px`
                        : undefined,
                    right:
                      cell.column.getIsPinned() === "right"
                        ? `${getTotalRight<Data>(table, cell.column)}px`
                        : undefined,
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="pagination">
        <button
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
        >
          {"<<"}
        </button>
        <button
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {"<"}
        </button>
        <button
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          {">"}
        </button>
        <button
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          disabled={!table.getCanNextPage()}
        >
          {">>"}
        </button>
        <span>
          | Page{" "}
          {`${
            table.getState().pagination.pageIndex + 1
          } of ${table.getPageCount()}`}
        </span>
        | {table.getRowModel().rows.length} Rows
        <select
          value={table.getState().pagination.pageSize}
          onChange={(e) => {
            table.setPageSize(Number(e.target.value));
          }}
        >
          {[2, 5, 10].map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              Show {pageSize}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
