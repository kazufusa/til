import { Button, Popper, ClickAwayListener } from "@mui/material";
import React from "react";
import { MyGridColumnsPanel } from "./MyGridColumnsPanel";

interface Props {
  className?: string;
}

export default function MyToolbarFilterButton({ className }: Props) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(anchorEl ? null : event.currentTarget);
  };
  const open = Boolean(anchorEl);
  return (
    <>
      <Button className={className} onClick={handleClick} variant="contained">
        COLUMNS
      </Button>
      {open && (
        <ClickAwayListener onClickAway={() => setAnchorEl(null)}>
          <Popper open={open} anchorEl={anchorEl} placement="bottom-end">
            <MyGridColumnsPanel />
          </Popper>
        </ClickAwayListener>
      )}
    </>
  );
}
