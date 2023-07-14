import { useDemoData } from "@mui/x-data-grid-generator";
import {
  DataGrid,
  GridEventListener,
  GridScrollParams,
  useGridApiContext,
  useGridApiEventHandler,
} from "@mui/x-data-grid";
import "./App.css";
import { useState, useRef, useCallback } from "react";

function App() {
  return (
    <>
      <Table />
    </>
  );
}

export default App;

function Table() {
  const { data } = useDemoData({
    dataSet: "Employee",
    rowLength: 190,
    maxColumns: 20,
  });

  return (
    <div style={{ height: 500, width: "100%" }}>
      <DataGrid
        components={{
          Toolbar: DragScroller,
        }}
        {...data}
      />
    </div>
  );
}

interface ScrollInfo {
  origin: { x: number; y: number };
  initialGridScrollParams: GridScrollParams;
}

function DragScroller() {
  const apiRef = useGridApiContext();
  const [scrollInfo, setScrollInfo] = useState<ScrollInfo | null>(null);
  const scrollInfoRef = useRef<ScrollInfo | null>(null); //  ref オブジェクト作成する
  scrollInfoRef.current = scrollInfo;

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (scrollInfoRef?.current) {
        const pos = { x: e.clientX, y: e.clientY };
        const dx = pos.x - scrollInfoRef.current.origin.x;
        const dy = pos.y - scrollInfoRef.current.origin.y;
        apiRef.current?.scroll({
          left: scrollInfoRef.current.initialGridScrollParams.left - dx,
          top: scrollInfoRef.current.initialGridScrollParams.top - dy,
        });
      }
    },
    [apiRef]
  );

  const handleMouseUp = useCallback(() => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  }, [handleMouseMove]);

  const handleCellMouseDown: GridEventListener<"cellMouseDown"> = useCallback(
    (_, e) => {
      if (apiRef.current) {
        setScrollInfo({
          origin: { x: e.clientX, y: e.clientY },
          initialGridScrollParams: apiRef.current.getScrollPosition(),
        });
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }
    },
    [apiRef, handleMouseMove, handleMouseUp]
  );

  useGridApiEventHandler(apiRef, "cellMouseDown", handleCellMouseDown);
  return <div></div>;
}
