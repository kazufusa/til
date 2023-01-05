import {
  FormControl,
  FormControlProps,
  MenuItem,
  Select,
  SelectChangeEvent,
  styled,
} from "@mui/material";
import {
  gridPaginationSelector,
  useGridApiContext,
  useGridRootProps,
  useGridSelector,
} from "@mui/x-data-grid";
import React from "react";

function PageSize(props: FormControlProps) {
  const apiRef = useGridApiContext();
  const rootProps = useGridRootProps();
  const paginationState = useGridSelector(apiRef, gridPaginationSelector);
  const handlePageSizeChange = React.useCallback(
    (event: SelectChangeEvent<number>) => {
      const newPageSize = Number(event.target.value);
      apiRef.current.setPageSize(newPageSize);
    },
    [apiRef]
  );

  return (
    <FormControl {...props}>
      <Select
        size="small"
        labelId="demo-simple-select-label"
        id="demo-simple-select"
        value={paginationState.pageSize}
        label=""
        onChange={handlePageSizeChange}
      >
        {rootProps.rowsPerPageOptions.map((v) => (
          <MenuItem key={`${v}`} value={v}>
            {v}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

export const MyPageSize = styled(PageSize)`
  margin-left: 10px;
`;
