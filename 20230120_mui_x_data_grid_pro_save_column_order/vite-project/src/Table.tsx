import Box from "@mui/material/Box";
import {
  DataGridPro,
  GridColDef,
  GridValueGetterParams,
  GridInitialState,
  useGridApiRef,
} from "@mui/x-data-grid-pro";
import { styled } from "@mui/material";
import { GridApiPro } from "@mui/x-data-grid-pro/models/gridApiPro";
import React from "react";

const columns: GridColDef[] = [
  { field: "id", headerName: "ID", width: 90 },
  {
    field: "firstName",
    headerName: "First name",
    width: 150,
    editable: true,
    flex: 1,
  },
  {
    field: "lastName",
    headerName: "Last name",
    width: 150,
    editable: true,
    flex: 1,
  },
  {
    field: "age",
    headerName: "Age",
    type: "number",
    width: 110,
    editable: true,
    flex: 1,
  },
  {
    field: "fullName",
    headerName: "Full name",
    description: "This column has a value getter and is not sortable.",
    sortable: false,
    width: 160,
    valueGetter: (params: GridValueGetterParams) =>
      `${params.row.firstName || ""} ${params.row.lastName || ""}`,
    flex: 1,
  },
  {
    field: "text",
    headerName: "text",
    description: "This column has a value getter and is not sortable.",
    sortable: false,
    width: 160,
    valueGetter: () => "Well, that's an interesting indictment from @Aperçu, I am not saying that I invented the solution but I've been using it in my projects for years now. And it has nothing to do with the comment you mentioned. And I am quite sure that in SO what matters is the most useful information in the right place and even if it already exists in some other place, too. Luckily, it seems like at least 51 guys have found this answer useful, you're welcome! – "
    ,
    renderCell: (params) => <Box sx={{
      height: "100%",
      width: "100%",
      background: "red",
      whiteSpace: "normal",
      overflow: "hidden",
      textOverflow: "ellipsis",
    }}>{params.value}</Box>,
    flex: 1,
  },
];

const rows = [
  { id: 1, lastName: "Snow", firstName: "Jon", age: 35 },
  { id: 2, lastName: "Lannister", firstName: "Cersei", age: 42 },
  { id: 3, lastName: "Lannister", firstName: "Jaime", age: 45 },
  { id: 4, lastName: "Stark", firstName: "Arya", age: 16 },
  { id: 5, lastName: "Targaryen", firstName: "Daenerys", age: null },
  { id: 6, lastName: "Melisandre", firstName: null, age: 150 },
  { id: 7, lastName: "Clifford", firstName: "Ferrara", age: 44 },
  { id: 8, lastName: "Frances", firstName: "Rossini", age: 36 },
  { id: 9, lastName: "Roxie", firstName: "Harvey", age: 65 },
];

const MyDataGrid = styled(DataGridPro)`` as typeof DataGridPro;

function storeState(key: string, apiRef: React.MutableRefObject<GridApiPro>) {
  window.localStorage.setItem(
    key,
    JSON.stringify({ default: apiRef.current.exportState() })
  );
}

function restoreState(key: string, presetName: string): GridInitialState {
  const data = JSON.parse(window.localStorage.getItem(key) || "{}")?.[
    presetName
  ];
  return {
    pinnedColumns: {
      left: data?.pinnedColumns?.left ?? [],
      right: data?.pinnedColumns?.right ?? [],
    },
    columns: {
      columnVisibilityModel: data?.columns?.columnVisibilityModel ?? [],
      orderedFields: data?.columns?.orderedFields ?? [],
      dimensions: data?.columns?.dimensions ?? {},
    },
  };
}

interface Props {
  name: string;
}

export default function DataGridDemo({ name }: Props) {
  const apiRef = useGridApiRef();
  const initialState: GridInitialState = {
    pinnedColumns: {
      left: ["fullName", "firstName"],
      right: ["lastName"],
    },
    columns: {
      columnVisibilityModel: {
        age: false
      },
      orderedFields: [
        "fullName",
        "firstName",
        "id",
        "text",
        "lastName",
      ],
    },
  }
  // const [initialState] = React.useState<GridInitialState>(
  //   restoreState(name, "default")
  // );

  return (
    <Box sx={{ height: 400, width: "100%" }}>
      <MyDataGrid
        apiRef={apiRef}
        rows={rows}
        columns={columns}
        initialState={initialState}
        onStateChange={() => storeState(name, apiRef)}
        pageSize={5}
        rowsPerPageOptions={[5]}
        disableSelectionOnClick
        experimentalFeatures={{ newEditingApi: true }}
        density="compact"
      />
    </Box>
  );
}
