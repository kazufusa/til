import { styled, TablePagination } from "@mui/material";
import {
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarContainerProps,
  GridToolbarFilterButton,
} from "@mui/x-data-grid";
import { MyPager } from "./MyPager";
import { MyPageSize } from "./MyPageSize";
import MyToolbarColumnsButton from "./MyToolbarColumnsButton";
import MyToolbarFilterButton from "./MyToolbarFilterButton";

function CustomToolbar(props: GridToolbarContainerProps) {
  return (
    <GridToolbarContainer {...props}>
      <GridToolbarColumnsButton />
      <GridToolbarFilterButton />
      <MyToolbarColumnsButton />
      <MyPageSize />
      <MyPager />
      <MyToolbarFilterButton className="grid-toolbar-filter-button" />
    </GridToolbarContainer>
  );
}

export default styled((props: GridToolbarContainerProps) => (
  <CustomToolbar {...props} />
))`
  height: 100px;
  background-color: lightgray;
  align-items: flex-end;

  & .grid-toolbar-filter-button {
    position: absolute;
    top: 0px;
    right: 0px;
  }
`;
