import { Box, Stack } from "@mui/material";
import {
  gridColumnsTotalWidthSelector,
  useGridApiContext,
} from "@mui/x-data-grid";
import React from "react";
import Slider from "./Slider";

export default function TableFooter() {
  const apiRef = useGridApiContext();
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

  const handleScroll = React.useCallback(() => {
    const left = apiRef.current?.getScrollPosition().left;
    if (left !== undefined && isFinite(left)) {
      setValue((left / valueLimit) * 100);
    }
  }, [setValue, apiRef, valueLimit]);

  React.useEffect(() => {
    const ref = apiRef.current?.windowRef?.current;
    if (!ref) return;
    ref.addEventListener("scroll", handleScroll, { passive: true });
    return () => ref.removeEventListener("scroll", handleScroll);
  }, [apiRef, handleScroll]);

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
