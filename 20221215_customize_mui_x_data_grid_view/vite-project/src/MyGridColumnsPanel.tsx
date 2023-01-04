import {
  gridColumnDefinitionsSelector,
  GridColumnsPanel,
  gridColumnVisibilityModelSelector,
  useGridApiContext,
  useGridRootProps,
  useGridSelector,
} from "@mui/x-data-grid";
import {
  Box,
  BoxProps,
  Checkbox,
  FormControlLabel,
  FormGroup,
  styled,
  Theme,
} from "@mui/material";
import React from "react";

function MyGridColumnsPanelCore(props: BoxProps) {
  const apiRef = useGridApiContext();
  const columns = useGridSelector(apiRef, gridColumnDefinitionsSelector);
  const columnVisibilityModel = useGridSelector(
    apiRef,
    gridColumnVisibilityModelSelector
  );

  const toggleColumn = (event: React.MouseEvent<HTMLLabelElement>) => {
    const { name: field } = event.target as HTMLInputElement;
    apiRef.current.setColumnVisibility(
      field,
      columnVisibilityModel[field] === false
    );
  };

  const allColumnsShown = React.useMemo(
    () => Object.values(columnVisibilityModel).every((v) => v !== false),
    [columnVisibilityModel]
  );

  const toggleAllColumns = React.useCallback(
    (isVisible: boolean) => {
      if (apiRef.current.unstable_caches.columns.isUsingColumnVisibilityModel) {
        if (isVisible) {
          return apiRef.current.setColumnVisibilityModel({});
        }

        return apiRef.current.setColumnVisibilityModel(
          Object.fromEntries(
            columns
              .filter((col) => col.hideable !== false)
              .map((col) => [col.field, false])
          )
        );
      }

      return apiRef.current.updateColumns(
        columns.map((col) => {
          if (col.hideable !== false) {
            return { field: col.field, hide: !isVisible };
          }

          return col;
        })
      );
    },
    [apiRef, columns]
  );

  return (
    <Box {...props}>
      <FormGroup>
        <FormControlLabel
          control={<Checkbox checked={allColumnsShown} />}
          label="すべて"
          onClick={() => toggleAllColumns(true)}
        />
        {columns
          .filter((column) => column.headerName)
          .map((column) => (
            <div key={column.field}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={columnVisibilityModel[column.field] !== false}
                  />
                }
                label={column.headerName}
                name={column.field}
                onClick={toggleColumn}
              />
            </div>
          ))}
      </FormGroup>
    </Box>
  );
}

export const MyGridColumnsPanel = styled(MyGridColumnsPanelCore)`
  margin-top: 8px;
  background-color: white;
  border-radius: 5px;
  border: 1px solid;
`;
