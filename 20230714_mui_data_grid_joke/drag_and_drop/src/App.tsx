import { useDemoData } from "@mui/x-data-grid-generator";
import {
  DataGrid,
  GridEventListener,
  GridScrollParams,
  useGridApiContext,
  useGridApiEventHandler,
  useGridNativeEventListener,
} from "@mui/x-data-grid";
import "./App.css";
import { useRef, useCallback } from "react";

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
    rowLength: 3,
    maxColumns: 20,
  });

  return (
    <div style={{ height: 500, width: "100%" }}>
      <DataGrid
        components={{
          Toolbar: DelayedDragScroller,
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
  const scrollInfoRef = useRef<ScrollInfo | null>(null);

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
        scrollInfoRef.current = {
          origin: { x: e.clientX, y: e.clientY },
          initialGridScrollParams: apiRef.current.getScrollPosition(),
        };
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

function DelayedDragScroller() {
  const apiRef = useGridApiContext();
  const scrollInfoRef = useRef<ScrollInfo | null>(null);
  const timeoutRef = useRef<number | undefined>(undefined);

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

  const handleFinish = useCallback(() => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleFinish);
    document.removeEventListener("dragstart", handleFinish);
    document.removeEventListener("selectstart", handleFinish);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  }, [handleMouseMove]);

  const handleLongeCellMouseDown = useCallback(() => {
    if (apiRef.current) {
      document.removeEventListener("mousemove", handleCancellableMouseMove);
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleFinish);
      document.addEventListener("dragstart", handleFinish);
      document.addEventListener("selectstart", handleFinish);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }
  }, [apiRef])

  const handleCancellableMouseMove = useCallback((e: MouseEvent) => {
    if (scrollInfoRef.current && timeoutRef.current) {
      const dx = e.clientX - scrollInfoRef.current.origin.x;
      const dy = e.clientY - scrollInfoRef.current.origin.y;
      if (Math.pow(dx, 2) + Math.pow(dy, 2) >= 100) {
        clearTimeout(timeoutRef.current)
        document.removeEventListener("mousemove", handleCancellableMouseMove);
        document.removeEventListener("selectstart", handleCancel);
        document.removeEventListener("dragstart", handleCancel);
      }
    }
  }, [])

  const handleCancel = useCallback(() => {
    console.log("cancel")
    clearTimeout(timeoutRef.current)
    document.removeEventListener("mousemove", handleCancellableMouseMove);
    document.removeEventListener("selectstart", handleCancel);
    document.removeEventListener("dragstart", handleCancel);
  }, [])

  const handleCellMouseDown: GridEventListener<"cellMouseDown"> = useCallback(
    (_, e) => {
      if (apiRef.current) {
        scrollInfoRef.current = {
          origin: { x: e.clientX, y: e.clientY },
          initialGridScrollParams: apiRef.current.getScrollPosition(),
        };
        timeoutRef.current = setTimeout(handleLongeCellMouseDown, 1000)
        document.addEventListener("mousemove", handleCancellableMouseMove);
      }
    },
    [apiRef, handleMouseMove, handleFinish]
  );

  useGridApiEventHandler(apiRef, "cellMouseDown", handleCellMouseDown);
  // console.log(apiRef.current?.rootElementRef)

  return <div></div>;
}
