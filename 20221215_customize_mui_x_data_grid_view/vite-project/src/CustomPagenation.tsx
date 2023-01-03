import {
  gridPageCountSelector,
  gridPageSelector,
  useGridApiContext,
  useGridSelector,
  gridColumnsTotalWidthSelector,
} from "@mui/x-data-grid";
import Pagination from "@mui/material/Pagination";
import { Button } from "@mui/material";

export default function CustomPagination() {
  const apiRef = useGridApiContext();
  const page = useGridSelector(apiRef, gridPageSelector);
  const pageCount = useGridSelector(apiRef, gridPageCountSelector);
  console.log(gridColumnsTotalWidthSelector(apiRef));
  console.log(apiRef.current?.getScrollPosition().left);
  console.log(apiRef.current?.getRootDimensions());

  return (
    <>
      top: {apiRef.current?.getScrollPosition().top} / left:
      {apiRef.current?.getScrollPosition().left}
      <Pagination
        color="primary"
        count={pageCount}
        page={page + 1}
        onChange={(_: React.ChangeEvent<unknown>, value) =>
          apiRef.current.setPage(value - 1)
        }
      />
      {pageCount !== 0 && `${page + 1} / ${pageCount}`}
      <Button onClick={() => apiRef?.current?.scroll({ left: 100 })}>
        move to pos
      </Button>
      <Button
        onClick={() => {
          apiRef?.current?.scrollToIndexes({ colIndex: 6 });
        }}
      >
        move to column
      </Button>
    </>
  );
}
