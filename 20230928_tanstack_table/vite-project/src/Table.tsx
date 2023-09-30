import { ConnectableElement, useDrop, useDrag } from "react-dnd";
import {
  Column,
  Header,
  Table,
  useReactTable,
  getCoreRowModel,
  ColumnOrderState,
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
    size: 50,
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
  }),
  columnHelper.accessor("valueWithMemo", {
    header: "valueWithMemo",
    cell: (props) => props.getValue().value ?? props.getValue().memo,
    size: 200,
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
      className="th"
      ref={attachRef}
      style={{ opacity: isDragging ? 0.5 : 1, width: header.getSize() }}
      draggable={!table.getState().columnSizingInfo.isResizingColumn}
    >
      {children}
    </div>
  );
}

export function Table() {
  const [columnOrder, setColumnOrder] = React.useState<ColumnOrderState>(
    columns.map((column) => column.header as string),
  );
  const table = useReactTable({
    data,
    columns,
    state: {
      columnOrder,
    },
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    debugTable: true,
    debugHeaders: true,
    debugColumns: true,
  });

  return (
    <>
      <div className="table" style={{ width: table.getCenterTotalSize() }}>
        <div className="thead">
          {table.getHeaderGroups().map((headerGroup) => (
            <div className="tr" key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <MyTh key={header.id} header={header} table={table}>
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
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
                  className="td"
                  key={cell.id}
                  style={{
                    width: cell.column.getSize(),
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
