import { useState } from "react";
import "./App.css";
import MuiSlider, { SliderProps } from "@mui/material/Slider";
import Box from "@mui/material/Box";
import styled from "@emotion/styled";

const Rail = styled(Box)({
  borderRadius: "5px",
  position: "absolute",
  left: "50%",
  transform: "translateX(-50%)",
  width: "300px",
  height: "10px",
  backgroundColor: "red",
});

const Slider = styled((props: SliderProps) => (
  <MuiSlider {...props} slots={{ rail: Rail, track: () => null }} />
))`
  height: 10px;
  color: #ffffff;
  & .MuiSlider-thumb {
    border-radius: 0;
    width: 100px;
    height: 10px;
    color: #fafafa;
    border-radius: 5px;
    &:focus,
    &:hover,
    &.Mui-active {
      box-shadow: none;
    }
  }
`;

function App() {
  const [value, setValue] = useState<number>(0);
  const handleChange = (_: Event, newValue: number | number[]) => {
    setValue(newValue as number);
  };

  return (
    <Box className="App" width={200}>
      {value}
      <Slider value={value} onChange={handleChange} />
    </Box>
  );
}

export default App;
