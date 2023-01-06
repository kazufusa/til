import { Button, ButtonProps, styled } from "@mui/material";
import { useGridApiContext, useGridRootProps } from "@mui/x-data-grid";

function CsvDownloadButton(props: ButtonProps) {
  const apiRef = useGridApiContext();
  const rootProps = useGridRootProps();
  return (
    <Button
      onClick={() =>
        apiRef.current.exportDataAsCsv(
          rootProps.componentsProps?.toolbar?.csvOptions ?? {}
        )
      }
      {...props}
    >
      CSV
    </Button>
  );
}

export const MyCsvDownloadButton = styled(CsvDownloadButton)``;
