import {
  gridPageCountSelector,
  gridPageSelector,
  useGridApiContext,
  useGridSelector,
  gridColumnsTotalWidthSelector,
} from '@mui/x-data-grid';
import Pagination from '@mui/material/Pagination';
import { Button } from '@mui/material';

export default function CustomPagination() {
  const apiRef = useGridApiContext();
  const page = useGridSelector(apiRef, gridPageSelector);
  const pageCount = useGridSelector(apiRef, gridPageCountSelector);
  console.log(gridColumnsTotalWidthSelector(apiRef))

  return (
    <>
      <Pagination
        color="primary"
        count={pageCount}
        page={page + 1}
        onChange={(_: React.ChangeEvent<unknown>, value) => apiRef.current.setPage(value - 1)}
      />
      {pageCount !== 0 && `${page + 1} / ${pageCount}`}
      <Button onClick={() => apiRef?.current?.scroll({ left: 500 })}> move to pos</Button>
      <Button onClick={() => { apiRef?.current?.scrollToIndexes({ colIndex: 0 }); console.log(apiRef?.current?.getScrollPosition()) }}> move to column</Button>
      <Button onClick={() => { apiRef?.current?.scrollToIndexes({ colIndex: 1 }); console.log(apiRef?.current?.getScrollPosition()) }}> move to column</Button>
      <Button onClick={() => { apiRef?.current?.scrollToIndexes({ colIndex: 2 }); console.log(apiRef?.current?.getScrollPosition()) }}> move to column</Button>
      <Button onClick={() => { apiRef?.current?.scrollToIndexes({ colIndex: 3 }); console.log(apiRef?.current?.getScrollPosition()) }}> move to column</Button>
      <Button onClick={() => { apiRef?.current?.scrollToIndexes({ colIndex: 4 }); console.log(apiRef?.current?.getScrollPosition()) }}> move to column</Button>
      <Button onClick={() => { apiRef?.current?.scrollToIndexes({ colIndex: 5 }); console.log(apiRef?.current?.getScrollPosition()) }}> move to column</Button>
      <Button onClick={() => { apiRef?.current?.scrollToIndexes({ colIndex: 6 }); console.log(apiRef?.current?.getScrollPosition()) }}> move to column</Button>
    </>
  );
}
