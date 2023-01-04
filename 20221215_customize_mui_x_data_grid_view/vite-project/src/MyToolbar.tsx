import { styled } from "@mui/material";
import {
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarContainerProps,
  GridToolbarFilterButton,
} from "@mui/x-data-grid";
import MyToolbarColumnsButton from "./MyToolbarColumnsButton";
import MyToolbarFilterButton from "./MyToolbarFilterButton";

function CustomToolbar(props: GridToolbarContainerProps) {
  return (
    <GridToolbarContainer {...props}>
      <GridToolbarColumnsButton />
      <GridToolbarFilterButton />
      <MyToolbarColumnsButton />
      <MyToolbarFilterButton className="grid-toolbar-filter-button" />
    </GridToolbarContainer>
  );
}

export default styled((props: GridToolbarContainerProps) => (
  <CustomToolbar {...props} />
))`
  height: 100px;
  background-color: lightgray;

  & .grid-toolbar-filter-button {
    position: absolute;
    top: 0px;
    right: 0px;
  }
`;
