import { DataGrid } from "@mui/x-data-grid";
import { useDemoData } from "@mui/x-data-grid-generator";
import CustomPagination from "./CustomPagenation";
import PageView from "./PageView";

export default function Table() {
  const { data } = useDemoData({
    dataSet: "Employee",
    rowLength: 190,
    maxColumns: 8,
  });

  return (
    <div style={{ height: 400, width: "100%" }}>
      <DataGrid
        scrollbarSize={100}
        components={{
          Header: () => (
            <>
              <h1>Title</h1>
              <CustomPagination />
            </>
          ),
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
