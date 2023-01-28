import {
  DataGrid,
  GridColumns,
  GridCsvExportOptions,
  GridRowsProp,
  GridToolbarContainer,
  GridToolbarExport,
} from "@mui/x-data-grid";

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
  {
    field: "test",
    headerName: "Test",
    filterable: false,
    hide: true,
    hideable: false,
  },
];

const csvOptions: GridCsvExportOptions = {
  allColumns: true,
};

function CustomToolbar() {
  return (
    <GridToolbarContainer>
      <GridToolbarExport csvOptions={csvOptions} />
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
        components={{ Toolbar: CustomToolbar, }}
        componentsProps={{
          toolbar: {
            csvOptions: {
              allColumns: true
            }
          }
        }}
      />
    </div>
  );
}
