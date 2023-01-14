import { Box, Stack } from "@mui/material";
import {
  gridColumnsTotalWidthSelector,
  useGridApiContext,
  useGridApiEventHandler,
} from "@mui/x-data-grid";
import React from "react";
import Slider from "./Slider";

export default function TableFooter() {
  const apiRef = useGridApiContext();

  useGridApiEventHandler(apiRef, "rowsScroll", ({ left }, event) => {
    if (left !== undefined && isFinite(left)) {
      setValue((left / valueLimit) * 100);
    }
  });

  const [value, setValue] = React.useState<number>(0);
  const thumbWidth =
    Math.min(
      1,
      (apiRef.current?.getRootDimensions()?.viewportOuterSize?.width ?? 0) /
        gridColumnsTotalWidthSelector(apiRef)
    ) * 200;

  const valueLimit =
    gridColumnsTotalWidthSelector(apiRef) -
    (apiRef.current?.getRootDimensions()?.viewportOuterSize?.width ?? 0);

  const handleChange = React.useCallback(
    (_: Event, newValue: number | number[]) => {
      if (!Array.isArray(newValue) && isFinite(newValue)) {
        apiRef.current?.scroll({ left: (newValue * valueLimit) / 100 });
      }
    },
    [apiRef, valueLimit]
  );

  return (
    <Stack
      direction="column"
      justifyContent="flex-start"
      alignItems="center"
      spacing={2}
    >
      <Box width={200}>
        <Slider
          width={200}
          value={value}
          thumbWidth={thumbWidth}
          onChange={handleChange}
        />
      </Box>
    </Stack>
  );
}
