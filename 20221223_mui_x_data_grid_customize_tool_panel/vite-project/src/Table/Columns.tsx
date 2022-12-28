import { ageComparator, ageOperators } from "./Age";
import { GridColDef, GridValueGetterParams, GridColumns } from "@mui/x-data-grid";
import RowModel from "./RowModel";

const Columns: GridColDef<RowModel>[] = [
  {
    field: "id",
    headerName: "ID",
    type: "number",
    width: 90,
  },
  {
    field: "firstName",
    headerName: "First name",
    type: "string",
    width: 150,
    editable: true,
  },
  {
    field: "lastName",
    headerName: "Last name",
    type: "string",
    width: 150,
    editable: true,
  },
  {
    field: "fullName",
    headerName: "Full name",
    type: "string",
    description: "This column has a value getter and is not sortable.",
    sortable: false,
    width: 160,
    valueGetter: (params: GridValueGetterParams) =>
      `${params.row.firstName || ""} ${params.row.lastName || ""}`,
  },
  {
    field: "age",
    headerName: "Age",
    type: "number",
    width: 110,
    editable: true,
    valueGetter: (params): number | string =>
      params.value.value ?? params.value.text,
    sortComparator: ageComparator,
    filterOperators: ageOperators,
  },
];

export default Columns;
