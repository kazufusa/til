import { useDemoData } from "@mui/x-data-grid-generator";
// import CustomPagination from "./CustomPagenation";
import PageView from "./PageView";
import { DataGrid } from "@mui/x-data-grid";
import { styled, Typography } from "@mui/material";
import MyToolbar from "./MyToolbar";

const MyDataGrid = styled(DataGrid)`` as typeof DataGrid;

export default function Table() {
  const { data } = useDemoData({
    dataSet: "Employee",
    rowLength: 190,
    maxColumns: 8,
  });

  return (
    <div style={{ height: 400, width: "100%" }}>
      <div>
        <Typography
          variant="h4"
          align="left"
          sx={{
            position: "absolute",
            zIndex: 1,
          }}
        >
          {" "}
          Hello MUI X Data Grid{" "}
        </Typography>
      </div>
      <MyDataGrid
        localeText={{
          filterPanelOperators: "",
          filterPanelColumns: "",
        }}
        scrollbarSize={100}
        components={{
          Toolbar: MyToolbar,
          Footer: () => (
            <>
              <p>Footer</p>
              <PageView />
            </>
          ),
        }}
        pagination
        {...data}
      />
    </div>
  );
}
