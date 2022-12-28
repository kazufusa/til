import { DataGrid } from "@mui/x-data-grid";
import Box from "@mui/material/Box";
import RowModel from "./Table/RowModel";
import Columns from "./Table/Columns";
import CustomToolbar from "./Table/CustomToolbar";
import { styled } from "@mui/material";

const rows: RowModel[] = [
  { id: 1, lastName: "Snow", firstName: "Jon", age: { value: 35 } },
  {
    id: 2,
    lastName: "Lannister",
    firstName: "Cersei",
    age: { text: "no data" },
  },
  { id: 3, lastName: "Lannister", firstName: "Jaime", age: { value: 45 } },
  {
    id: 4,
    lastName: "Jon",
    firstName: "Smith",
    age: { text: "age is unknow" },
  },
];

const MyDataGrid = styled(DataGrid)`
` as typeof DataGrid;

export default function Table() {
  return (
    <Box sx={{ height: 400, width: "100%" }}>
      <MyDataGrid
        rows={rows}
        columns={Columns}
        pageSize={5}
        rowsPerPageOptions={[5]}
        checkboxSelection
        disableSelectionOnClick
        experimentalFeatures={{ newEditingApi: true }}
        components={{
          Toolbar: CustomToolbar,
        }}
      />
    </Box>
  );
}
// (property) columns: GridColumns<GridValidRowModel>
// (alias) const Columns: GridColDef<RowModel, any, any>[]
