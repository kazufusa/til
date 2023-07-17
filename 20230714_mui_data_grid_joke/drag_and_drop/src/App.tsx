import { useDemoData } from "@mui/x-data-grid-generator";
import {
  DataGrid,
  GridEventListener,
  GridScrollParams,
  useGridApiContext,
  useGridApiEventHandler,
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
  const virtualScrollerRef = useRef<HTMLElement | undefined>(undefined)
  const virtualScroller = apiRef.current?.rootElementRef?.current?.getElementsByClassName('MuiDataGrid-virtualScrollerContent')?.[0]! as HTMLElement | undefined;
  if (virtualScroller) virtualScrollerRef.current = virtualScroller;
  const scrollInfoRef = useRef<ScrollInfo | null>(null);
  const timeoutRef = useRef<number | undefined>(undefined);

  const handleMouseMove = useCallback((e: Event) => {
    if (!(e instanceof MouseEvent)) return
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
    virtualScrollerRef.current?.removeEventListener("mousemove", handleMouseMove);
    virtualScrollerRef.current?.removeEventListener("mouseup", handleFinish);
    virtualScrollerRef.current?.removeEventListener("dragstart", handleFinish);
    virtualScrollerRef.current?.removeEventListener("selectstart", handleFinish);
    virtualScrollerRef.current?.style.removeProperty("cursor");
    virtualScrollerRef.current?.style.removeProperty("user-select");
    // document.body.style.removeProperty("cursor");
    // document.body.style.removeProperty("user-select");
  }, [handleMouseMove]);

  const handleLongCellMouseDown = useCallback(() => {
    if (apiRef.current && virtualScrollerRef.current) {
      virtualScrollerRef.current.removeEventListener("mousemove", handleCancellableMouseMove);
      virtualScrollerRef.current.addEventListener("mousemove", handleMouseMove);
      virtualScrollerRef.current.addEventListener("mouseup", handleFinish);
      virtualScrollerRef.current.addEventListener("dragstart", handleFinish);
      virtualScrollerRef.current.addEventListener("selectstart", handleFinish);
      virtualScrollerRef.current.style.cursor = "grabbing";
      virtualScrollerRef.current.style.userSelect = "none";
      // document.body.style.cursor = "grabbing";
      // document.body.style.userSelect = "none";
    }
  }, [apiRef])

  const handleCancellableMouseMove = useCallback((e: Event) => {
    if (!(e instanceof MouseEvent)) return
    if (scrollInfoRef.current && timeoutRef.current) {
      const dx = e.clientX - scrollInfoRef.current.origin.x;
      const dy = e.clientY - scrollInfoRef.current.origin.y;
      if (Math.pow(dx, 2) + Math.pow(dy, 2) >= 100) {
        clearTimeout(timeoutRef.current)
        virtualScrollerRef.current?.removeEventListener("mousemove", handleCancellableMouseMove);
        virtualScrollerRef.current?.removeEventListener("selectstart", handleCancel);
        virtualScrollerRef.current?.removeEventListener("dragstart", handleCancel);
      }
    }
  }, [])

  const handleCancel = useCallback(() => {
    clearTimeout(timeoutRef.current)
    virtualScrollerRef.current?.removeEventListener("mousemove", handleCancellableMouseMove);
    virtualScrollerRef.current?.removeEventListener("selectstart", handleCancel);
    virtualScrollerRef.current?.removeEventListener("dragstart", handleCancel);
  }, [])

  const handleMouseDown = useCallback(
    (e: Event) => {
      if (apiRef.current && e instanceof MouseEvent) {
        scrollInfoRef.current = {
          origin: { x: e.clientX, y: e.clientY },
          initialGridScrollParams: apiRef.current.getScrollPosition(),
        };
        timeoutRef.current = setTimeout(handleLongCellMouseDown, 1000)
        virtualScrollerRef.current?.addEventListener("mousemove", handleCancellableMouseMove);
      }
    },
    [apiRef, handleMouseMove, handleFinish]
  );

  virtualScrollerRef.current?.addEventListener("mousedown", handleMouseDown)

  return <div></div>;
}
