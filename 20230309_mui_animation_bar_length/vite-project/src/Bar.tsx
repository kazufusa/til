import { Box, styled, Tooltip, tooltipClasses } from "@mui/material";

interface Props {
  className?: string;
  ratio: number;
}

export const Bar = styled(({ className, ratio }: Props) => {
  return (
    <Tooltip
      arrow
      title={
        <>
          <p>This is horizontal bar</p>
          <p>ratio is {ratio * 100}%</p>
        </>
      }
      PopperProps={{ className: `${className} popper` }}
    >
      <Box className={`${className} barBox`}>
        <div className="bar" style={{ width: `calc(100%*${ratio})` }}></div>
      </Box>
    </Tooltip>
  );
})`
  &.barBox {
    width: 100%;
    background: gray;
    height: 20px;
    position: relative;
    display: grid;
    align-items: center;
    .bar {
      position: absolute;
      height: 8px;
      background: white;
      transition: all 0.8s cubic-bezier(0.23, 1, 0.32, 1);
      border-radius: 10px;
    }
  }

  &.popper > .${tooltipClasses.tooltip} {
    width: 120px;
    background: rgba(255, 255, 255, 0.8);
    color: black;
    border-radius: 10px;
  }

  .${tooltipClasses.arrow} {
    border-right: 5px solid transparent;
    border-top: 8px solid rgba(97, 97, 97, 0.92);
    border-left: 5px solid transparent;
  }
`;
