import { useDemoData } from "@mui/x-data-grid-generator";
// import CustomPagination from "./CustomPagenation";
import PageView from "./PageView";
import { DataGrid } from "@mui/x-data-grid";
import { styled } from "@mui/material";
import { MyGridFilterPanel } from "./MyGridFilterPanel";
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
      <MyDataGrid
        localeText={{
          filterPanelOperators: "",
          filterPanelColumns: "",
        }}
        scrollbarSize={100}
        components={{
          Toolbar: MyToolbar,
          // FilterPanel: MyGridFilterPanel,
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
        pagination
        {...data}
      />
    </div>
  );
}
