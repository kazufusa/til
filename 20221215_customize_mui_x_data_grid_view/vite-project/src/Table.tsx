import { DataGrid } from '@mui/x-data-grid';
import { useDemoData } from '@mui/x-data-grid-generator';
import CustomPagination from "./CustomPagenation";

export default function Table() {
  const { data } = useDemoData({
    dataSet: 'Employee',
    rowLength: 30,
    maxColumns: 8,
  });

  return (
    <div style={{ height: 400, width: '100%' }}>
      <DataGrid
        scrollbarSize={100}
        components={{
          Toolbar: () => <>
            <h1>Title</h1>
            <CustomPagination />
          </>
        }}
        pagination
        {...data}
      />
    </div>
  );
}
