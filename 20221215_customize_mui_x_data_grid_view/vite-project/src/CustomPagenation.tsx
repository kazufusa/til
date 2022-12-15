import {
  gridPageCountSelector,
  gridPageSelector,
  useGridApiContext,
  useGridSelector,
} from '@mui/x-data-grid';
import Pagination from '@mui/material/Pagination';

export default function CustomPagination() {
  const apiRef = useGridApiContext();
  const page = useGridSelector(apiRef, gridPageSelector);
  const pageCount = useGridSelector(apiRef, gridPageCountSelector);
  return (
    <>
      <Pagination
        color="primary"
        count={pageCount}
        page={page + 1}
        onChange={(_: React.ChangeEvent<unknown>, value) => apiRef.current.setPage(value - 1)}
      />
      {pageCount !== 0 && `${page+1} / ${pageCount}`}
    </>
  );
}
