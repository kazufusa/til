import { styled } from "@mui/material";
import {
  GridToolbarContainer,
  GridToolbarContainerProps,
} from "@mui/x-data-grid";
import PageView from "./PageView";
import { MyCsvDownloadButton } from "./MyCsvDownloadButton";
import { MyDensityButton } from "./MyDensityButton";
import { MyPager } from "./MyPager";
import { MyPageSize } from "./MyPageSize";
import MyToolbarColumnsButton from "./MyToolbarColumnsButton";
import MyToolbarFilterButton from "./MyToolbarFilterButton";

function CustomToolbar(props: GridToolbarContainerProps) {
  return (
    <GridToolbarContainer {...props}>
      <MyDensityButton />
      <MyCsvDownloadButton />
      <MyToolbarColumnsButton />
      <MyPageSize />
      <MyPager />
      <MyToolbarFilterButton className="grid-toolbar-filter-button" />
      <PageView />
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
