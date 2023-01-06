import { Button, ButtonProps, styled } from "@mui/material";
import {
  GridDensity,
  gridDensityValueSelector,
  useGridApiContext,
  useGridSelector,
} from "@mui/x-data-grid";

const nextDensity: {
  [key in GridDensity]: GridDensity;
} = {
  compact: "standard",
  standard: "comfortable",
  comfortable: "compact",
};

function DensityButton(props: ButtonProps) {
  const apiRef = useGridApiContext();
  const densityValue = useGridSelector(apiRef, gridDensityValueSelector);

  return (
    <Button
      variant="contained"
      {...props}
      onClick={() => apiRef.current.setDensity(nextDensity[densityValue])}
    >
      {densityValue}
    </Button>
  );
}

export const MyDensityButton = styled(DensityButton)``;
