import { Button } from "@mui/material";
import {
  DataGrid,
  GridColumns,
  GridCsvExportOptions,
  GridRowsProp,
  GridToolbarContainer,
  GridToolbarExport,
  gridVisibleSortedRowIdsSelector,
  useGridApiContext,
} from "@mui/x-data-grid";
import { GridApiCommunity } from "@mui/x-data-grid/models/api/gridApiCommunity";

interface OtherRowModel {
  id: number;
  name: string;
}

interface BaseRowModel {
  id: number;
  jobTitle: string;
  recruitmentDate: Date;
  contract: string;
}

interface MyRowModel extends BaseRowModel {
  test: number;
}

const rows: GridRowsProp<MyRowModel> = [
  {
    jobTitle: "Head of Human Resources",
    recruitmentDate: new Date(2020, 8, 12),
    contract: "full time",
    id: 0,
    test: 1,
  },
  {
    jobTitle: "Head of Sales",
    recruitmentDate: new Date(2017, 3, 4),
    contract: "full time",
    id: 1,
    test: 1,
  },
  {
    jobTitle: "Sales Person",
    recruitmentDate: new Date(2020, 11, 20),
    contract: "full time",
    id: 2,
    test: 1,
  },
  {
    jobTitle: "Sales Person",
    recruitmentDate: new Date(2020, 10, 14),
    contract: "part time",
    id: 3,
    test: 1,
  },
  {
    jobTitle: "Sales Person",
    recruitmentDate: new Date(2017, 10, 29),
    contract: "part time",
    id: 4,
    test: 1,
  },
  {
    jobTitle: "Sales Person",
    recruitmentDate: new Date(2020, 7, 21),
    contract: "full time",
    id: 5,
    test: 1,
  },
  {
    jobTitle: "Sales Person",
    recruitmentDate: new Date(2020, 7, 20),
    contract: "intern",
    id: 6,
    test: 1,
  },
  {
    jobTitle: "Sales Person",
    recruitmentDate: new Date(2019, 6, 28),
    contract: "full time",
    id: 7,
    test: 1,
  },
  {
    jobTitle: "Head of Engineering",
    recruitmentDate: new Date(2016, 3, 14),
    contract: "full time",
    id: 8,
    test: 1,
  },
  {
    jobTitle: "Tech lead front",
    recruitmentDate: new Date(2016, 5, 17),
    contract: "full time",
    id: 9,
    test: 1,
  },
  {
    jobTitle: "Front-end developer",
    recruitmentDate: new Date(2019, 11, 7),
    contract: "full time",
    id: 10,
    test: 1,
  },
  {
    jobTitle: "Tech lead devops",
    recruitmentDate: new Date(2021, 7, 1),
    contract: "full time",
    id: 11,
    test: 1,
  },
  {
    jobTitle: "Tech lead back",
    recruitmentDate: new Date(2017, 0, 12),
    contract: "full time",
    id: 12,
    test: 1,
  },
  {
    jobTitle: "Back-end developer",
    recruitmentDate: new Date(2019, 2, 22),
    contract: "intern",
    id: 13,
    test: 1,
  },
];

const columns: GridColumns = [
  { field: "jobTitle", headerName: "Job Title", width: 200 },
  {
    field: "recruitmentDate",
    headerName: "Recruitment Date",
    type: "date",
    width: 150,
  },
  {
    field: "contract",
    headerName: "Contract Type",
    type: "singleSelect",
    valueOptions: ["full time", "part time", "intern"],
    width: 150,
    renderCell: (params) => <p>!<strong>{params.value}</strong>!</p>
  },
];

const csvOptions: GridCsvExportOptions = {
  delimiter: "aaa",
};

export function exportFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}


function getDataAsCsv(apiRef: React.MutableRefObject<GridApiCommunity>): string {
  const rowIds = gridVisibleSortedRowIdsSelector(apiRef)
  const rows = rowIds.map((id) => apiRef.current.getRow(id) ?? []).flat()
  // console.log(rows);
  // console.log(apiRef.current.getCellValue(rowIds[1], "jobTitle"))
  // console.log(apiRef.current.getCellParams(rowIds[0], "jobTitle").formattedValue)
  console.log(apiRef.current.getRowModels())

  return "aaa,bbb,ccc\nddd,eee,fff"
}

const serializeCellValue = (value: string, delimiterCharacter: string) => {
  if (typeof value === 'string') {
    const formattedValue = value.replace(/"/g, '""');
    if ([delimiterCharacter, '\n', '\r'].some((delimiter) => formattedValue.includes(delimiter))) {
      return `"${formattedValue}"`;
    }
    return formattedValue;
  }
  return value;
};


const serializeRow = (
  id: GridRowId,
  columns: GridStateColDef[],
  getCellParams: (id: GridRowId, field: string) => GridCellParams,
  delimiterCharacter: string,
) =>
  columns.map((column) => {
    const cellParams = getCellParams(id, column.field);
    if (process.env.NODE_ENV !== 'production') {
      if (String(cellParams.formattedValue) === '[object Object]') {
        objectFormattedValueWarning();
      }
    }
    return serializeCellValue(cellParams.formattedValue, delimiterCharacter);
  });

export function buildCSV(options: BuildCSVOptions): string {
  const { columns, rowIds, getCellParams, delimiterCharacter, includeHeaders } = options;

  const CSVBody = rowIds
    .reduce<string>(
      (acc, id) =>
        `${acc}${serializeRow(id, columns, getCellParams, delimiterCharacter).join(
          delimiterCharacter,
        )}\r\n`,
      '',
    )
    .trim();

  if (!includeHeaders) {
    return CSVBody;
  }

  const CSVHead = `${columns
    .filter((column) => column.field !== GRID_CHECKBOX_SELECTION_COL_DEF.field)
    .map((column) => serializeCellValue(column.headerName || column.field, delimiterCharacter))
    .join(delimiterCharacter)}\r\n`;

  return `${CSVHead}${CSVBody}`.trim();
}


function CustomToolbar() {
  const apiRef = useGridApiContext();

  const handleClick = () => {
    const csv = getDataAsCsv(apiRef)
    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csv], { type: 'text/csv' });
    exportFile(blob, "a.csv")
  }

  return (
    <GridToolbarContainer>
      <GridToolbarExport csvOptions={csvOptions} />
      <Button onClick={handleClick}> ORIGINAL CSV </Button>
    </GridToolbarContainer>
  );
}

export default function Table() {
  return (
    <div style={{ height: 300, width: "100%" }}>
      <DataGrid
        rows={rows}
        columns={columns}
        pageSize={1}
        components={{
          Toolbar: CustomToolbar,
        }}
        componentsProps={{ toolbar: { csvOptions } }}
      />
    </div>
  );
}
