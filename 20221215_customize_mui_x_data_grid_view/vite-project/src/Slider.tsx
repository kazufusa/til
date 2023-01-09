import "./App.css";
import MuiSlider, { SliderProps } from "@mui/material/Slider";
import Box from "@mui/material/Box";
import styled from "@emotion/styled";

const Rail = styled(Box, { shouldForwardProp: (prop) => prop !== "ownerState" }
)({
  borderRadius: "5px",
  position: "absolute",
  left: "50%",
  transform: "translateX(-50%)",
  width: "300px",
  height: "10px",
  backgroundColor: "red",
});

export default styled((props: SliderProps) => {
  console.log(props.value)
  return (
  <MuiSlider {...props} slots={{ rail: Rail, track: () => null }} />
  )
  })`
  height: 10px;
  color: #ffffff;
  & .MuiSlider-thumb {
    border-radius: 0;
    width: 100px;
    height: 11px;
    color: #fafafa;
    border-radius: 5px;
    &:focus,
    &:hover,
    &.Mui-active {
      box-shadow: none;
    }
  }
`;
