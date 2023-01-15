import { createTheme, ThemeProvider } from "@mui/material";
import { DataGrid, GridColDef, GridRowsProp, GridSortingInitialState, GridSortModel, SortGridMenuItems, useGridApiContext } from "@mui/x-data-grid";
import React from "react";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});

const rows: GridRowsProp = [
  { id: 1, col1: 'Hello', col2: 'World' },
  { id: 2, col1: 'DataGridPro', col2: 'is Awesome' },
  { id: 3, col1: 'MUI', col2: 'is Amazing' },
];

const columns: GridColDef[] =
  [
    { field: 'col1', headerName: 'Column 1', width: 150, sortingOrder: ["asc", "desc"], sortable: false },
    { field: 'col2', headerName: 'Column 2', width: 150, sortingOrder: ["asc", "desc"], sortable: false },
  ];


export function Table() {
  const [sortingModel, setSortingModel] = React.useState<GridSortingInitialState>({})

  return (
    <div style={{ height: 300, width: '100%' }}>
      <ThemeProvider theme={darkTheme}>
        <DataGrid
          rows={rows}
          columns={columns}
          onSortModelChange={(model: GridSortModel) => {
            console.log("change");
            setSortingModel({ sortModel: model });
          }}
          initialState={{ sorting: sortingModel }}
          components={{
            Toolbar: Toolbar,
          }}
          disableColumnMenu
        />
      </ThemeProvider>
    </div>
  )
}

const Toolbar = () => {
  const apiRef = useGridApiContext();
  return (
    <>
      <button onClick={() => {
        apiRef.current.setSortModel([{ field: "col1", sort: "desc" }]);
      }}>
        desc
      </button>
      <button onClick={() => {
        apiRef.current.setSortModel([{ field: "col1", sort: "asc" }]);
      }}>
        asc
      </button>
    </>
  )
}
