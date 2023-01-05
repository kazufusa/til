import { Button, styled } from "@mui/material";
import {
  gridPaginationSelector,
  useGridApiContext,
  useGridSelector,
} from "@mui/x-data-grid";

interface Props {
  className?: string;
}

function Pager(props: Props) {
  const apiRef = useGridApiContext();
  const paginationState = useGridSelector(apiRef, gridPaginationSelector);

  return (
    <div className={props.className ?? ""}>
      <Button
        variant="contained"
        disabled={paginationState.page === 0}
        onClick={() => apiRef.current.setPage(paginationState.page - 1)}
      >
        {"<"}
      </Button>
      <Button
        variant="contained"
        disabled={
          paginationState.page ===
          Math.floor(paginationState.rowCount / paginationState.pageSize)
        }
        onClick={() => apiRef.current.setPage(paginationState.page + 1)}
      >
        {">"}
      </Button>
    </div>
  );
}

export const MyPager = styled(Pager)`
  margin-left: 10px;
`;
