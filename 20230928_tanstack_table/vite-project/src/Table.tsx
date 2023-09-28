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
  }),
  columnHelper.accessor("enumValue", {
    header: "enumValue",
    cell: (props) => props.getValue(),
  }),
  columnHelper.accessor("nullableRatio", {
    header: "nullableRatio",
    cell: (props) => {
      const value = props.getValue();
      return value !== undefined ? ratioFormatter.format(value) : "-";
    },
  }),
  columnHelper.accessor("valueWithMemo", {
    header: "valueWithMemo",
    cell: (props) => props.getValue().value ?? props.getValue().memo,
  }),
];

export function Table() {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <>
      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
