import { styled, Button, Popper, ClickAwayListener } from "@mui/material";
import {
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarContainerProps,
  GridToolbarFilterButton,
} from "@mui/x-data-grid";
import React from "react";
import { MyGridFilterPanel } from "./MyGridFilterPanel";

function CustomToolbar(props: GridToolbarContainerProps) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(anchorEl ? null : event.currentTarget);
  };
  const open = Boolean(anchorEl);
  return (
    <GridToolbarContainer {...props}>
      <GridToolbarColumnsButton />
      <GridToolbarFilterButton />
      <Button className="grid-toolbar-filter-button" onClick={handleClick}>
        FILTER
      </Button>
      {open &&
        <ClickAwayListener onClickAway={()=>setAnchorEl(null)}>
          <Popper open={open} anchorEl={anchorEl} placement="bottom-end">
            <MyGridFilterPanel />
          </Popper>
        </ClickAwayListener>
      }
    </GridToolbarContainer>
  );
}

export default styled((props: GridToolbarContainerProps) => <CustomToolbar {...props} />)`
  height: 100px;
  background-color: lightgray;

  & .grid-toolbar-filter-button {
    position: absolute;
    top: 0px;
    right: 0px;
  }
`
