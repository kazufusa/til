import { DataGridPro as DataGrid, useGridApiContext } from '@mui/x-data-grid-pro';
import { useDemoData } from '@mui/x-data-grid-generator';
import React from "react";

export function Table() {
  const { data } = useDemoData({
    dataSet: 'Commodity',
    rowLength: 1,
    editable: false,
  })
  return (
    <div style={{ height: 300, width: 1000 }}>
      <DataGrid {...data}
        components={{ Footer: () => (<DragScroller />), }}
      />
    </div>
  );
}

interface Props  {
  a?: number;
}

function DragScroller({a = 1} : Props = {}) {
  const apiRef = useGridApiContext();
  const [count, setCount] = React.useState<number>(0);
  React.useEffect(() => {
    return apiRef.current?.subscribeEvent(
      "cellClick",
      (_, e) => {
        e.preventDefault()
        e.stopPropagation()
        setCount((v) => v + 1)
      }
    )
  }, [apiRef])
  return <>{a} {count} </>
}
