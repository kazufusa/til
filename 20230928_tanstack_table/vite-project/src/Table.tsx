import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";

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

export function Table() {
  const table = useReactTable({
    data,
    columns,
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
                <div
                  key={header.id}
                  className="th"
                  style={{
                    width: header.getSize(),
                  }}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  <div
                    {...{
                      onMouseDown: header.getResizeHandler(),
                      onTouchStart: header.getResizeHandler(),
                      className: `resizer ${
                        header.column.getIsResizing() ? "isResizing" : ""
                      }`,
                    }}
                  />
                </div>
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
