import { Button, Popper, ClickAwayListener } from "@mui/material";
import React from "react";
import { MyGridFilterPanel } from "./MyGridFilterPanel";

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
      <Button className={className} onClick={handleClick}>
        FILTER
      </Button>
      {open && (
        <ClickAwayListener onClickAway={() => setAnchorEl(null)}>
          <Popper open={open} anchorEl={anchorEl} placement="bottom-end">
            <MyGridFilterPanel />
          </Popper>
        </ClickAwayListener>
      )}
    </>
  );
}
