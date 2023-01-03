import { useDemoData } from "@mui/x-data-grid-generator";
// import CustomPagination from "./CustomPagenation";
import PageView from "./PageView";
import { DataGrid } from "@mui/x-data-grid";
import { styled, Box } from "@mui/material";
import { MyGridFilterPanel } from "./MyGridFilterPanel";
import MyToolbar from "./MyToolbar";
import React from "react";

const MyDataGrid = styled(DataGrid)`` as typeof DataGrid;

export default function Table() {
  const { data } = useDemoData({
    dataSet: "Employee",
    rowLength: 190,
    maxColumns: 8,
  });

  const [topBarEl, setTopBarEl] = React.useState(null);

  return (
    <div style={{ height: 400, width: "100%" }}>
      <Box
        className="AAA"
        ref={setTopBarEl}
        width="100%"
        height="30px"
        sx={{
          background: "green",
          zIndex: 10000,
        }}
      />
      <MyDataGrid
        localeText={{
          filterPanelOperators: "",
          filterPanelColumns: "",
        }}
        scrollbarSize={100}
        components={{
          Toolbar: MyToolbar,
          FilterPanel: MyGridFilterPanel,
          // Header: (props) => (
          //   <Box {...props}>
          //     <h1>Title</h1>
          //     <CustomPagination />
          //   </Box>
          // ),
          Footer: () => (
            <>
              <p>Footer</p>
              <PageView />
            </>
          ),
        }}
        componentsProps={{
          panel: {
            anchorEl: topBarEl,
          },
        }}
        pagination
        {...data}
      />
    </div>
  );
}
