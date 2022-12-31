import { Box, Typography } from "@mui/material";
import {
  gridPageSelector,
  useGridApiContext,
  useGridSelector,
  gridPageSizeSelector,
  gridRowCountSelector,
} from "@mui/x-data-grid";

export default function PageView() {
  const apiRef = useGridApiContext();
  const page = useGridSelector(apiRef, gridPageSelector);
  const pageSize = useGridSelector(apiRef, gridPageSizeSelector);
  const rowCount = useGridSelector(apiRef, gridRowCountSelector);

  return (
    <Box>
      {rowCount !== 0 && (
        <>
          <Typography>
            <span style={{ color: "cyan" }}>{page * pageSize + 1}</span>-
            <span style={{ color: "cyan" }}>
              {Math.min(rowCount, (page + 1) * pageSize)}
            </span>
            /{rowCount}
          </Typography>
        </>
      )}
    </Box>
  );
}
