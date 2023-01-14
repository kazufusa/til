import { useDemoData } from "@mui/x-data-grid-generator";
import { DataGrid } from "@mui/x-data-grid";
import { createTheme, ThemeProvider } from "@mui/material";
import TableFooter from "./TableFooter";
// import dynamic from "next/dynamic";
// const TableFooter = dynamic(() => import("./TableFooter"));

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});

export default function Table() {
  const { data } = useDemoData({
    dataSet: "Employee",
    rowLength: 190,
    maxColumns: 18,
  });

  return (
    <ThemeProvider theme={darkTheme}>
      <DataGrid
        sx={{ width: "100%" }}
        components={{
          Footer: TableFooter,
          ColumnUnsortedIcon: () => null,
          ColumnSortedAscendingIcon: () => null,
          ColumnSortedDescendingIcon: () => null,
        }}
        pagination
        {...data}
        disableColumnMenu
      />
    </ThemeProvider>
  );
}
