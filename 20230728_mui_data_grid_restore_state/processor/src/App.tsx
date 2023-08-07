import React from "react";
import "./App.css";
import {
  DataGridPro as DataGrid,
  GridRowsProp,
  GridColDef,
} from "@mui/x-data-grid-pro";

function App() {
  return (
    <>
      <Table />
    </>
  );
}

export default App;

const rows: GridRowsProp = [
  { id: 1, col1: "Hello", col2: "World", col3: "!" },
  { id: 2, col1: "DataGridPro", col2: "is Awesome", col3: "?!" },
  { id: 3, col1: "MUI", col2: "is Amazing", col3: "?" },
];

const columns: GridColDef[] = [
  { field: "col1", headerName: "Column 1", width: 150 },
  { field: "col2", headerName: "Column 2", width: 250 },
  { field: "col3", headerName: "Column 3", width: 350 },
];

const initialState = {
  pinnedColumns: { left: ["col1"] }, // working!
  columns: {
    orderedFields: ["col1", "col3", "col2"], // working!
    columnVisibilityModel: { col3: false }, // working!
    lookup: { // Not working
      "col1": {
        width: 10,
        minWidth: null,
        maxWidth: null,
      },
      "col2": {
        width: 10,
        minWidth: null,
        maxWidth: null,
        computedWidth: 1000,
      }
    },
  },
};

export function Table() {
  const [state, setState] = React.useState({});
  return (
    <>
    <pre style={{background: "black", color: "white", width: 800, height: 300, overflow: "auto",  textAlign: "left"}}>
        {JSON.stringify(state, null, 2)}
      </pre>
      <div style={{ height: 300, width: 800 }}>
        <DataGrid
          initialState={initialState}
          rows={rows}
          columns={columns}
          onStateChange={(params) => setState(params)}
        />
      </div>
    </>
  );
}
