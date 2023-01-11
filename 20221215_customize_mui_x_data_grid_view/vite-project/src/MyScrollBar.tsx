import { Stack, Box, styled } from "@mui/material";
import {
  gridColumnsTotalWidthSelector,
  useGridApiContext,
} from "@mui/x-data-grid";
import React from "react";
import Slider from "./Slider";

function useThrottle<T>(
  setValue: React.Dispatch<React.SetStateAction<T>>,
  ms: number
): (value: T) => void {
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout>>();
  const valueRef = React.useRef<T>();
  const cb = React.useCallback(
    (value: T) => {
      valueRef.current = value;
      if (timeoutRef.current === undefined) {
        setValue(value);
        timeoutRef.current = setTimeout(() => {
          valueRef.current !== undefined && setValue(valueRef.current);
          timeoutRef.current = undefined;
        }, ms);
      }
    },
    [setValue, ms]
  );
  return cb;
}

function MyScrollBar() {
  const apiRef = useGridApiContext();
  const [value, setValue] = React.useState<number>(0);
  const totalWidth = gridColumnsTotalWidthSelector(apiRef) ?? 0;
  const viewportWidth =
    apiRef.current?.getRootDimensions()?.viewportOuterSize?.width ?? 0;
  const xMax = React.useMemo(
    () =>
      (gridColumnsTotalWidthSelector(apiRef) ?? 0) -
      (apiRef.current?.getRootDimensions()?.viewportOuterSize?.width ?? 0),
    [apiRef]
  );

  const throttoledSetValue = useThrottle(setValue, 50);

  const handleScroll = React.useCallback(() => {
    const index = apiRef?.current.getScrollPosition().left;
    throttoledSetValue((index / xMax) * 100);
    {
      /* setValue(index / xMax * 100) */
    }
  }, [setValue, apiRef]);

  React.useEffect(() => {
    const ref = apiRef.current?.windowRef?.current;
    if (!ref) return;
    ref.addEventListener("scroll", handleScroll, { passive: true });
    return () => ref.removeEventListener("scroll", handleScroll);
  }, [apiRef, handleScroll]);

  const handleChange = (_: Event, newValue: number | number[]) => {
    if (isFinite(newValue as number)) {
      apiRef?.current?.scroll({ left: ((newValue as number) / 100) * xMax });
      setValue(newValue as number);
    }
  };

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
          thumbWidth={Math.min(1, viewportWidth / totalWidth) * 200}
          onChange={handleChange}
        />
      </Box>
    </Stack>
  );
}

export default styled(MyScrollBar)``;
