import "./App.css";
import MuiSlider from "@mui/material/Slider";
import styled from "@emotion/styled";

interface Props {
  className?: string;
  width: number;
  thumbWidth: number;
  value: number;
  onChange: (event: Event, newValue: number | number[]) => void;
}

export default styled(({ value, onChange, className }: Props) => {
  return (
    <MuiSlider
      className={className}
      value={value}
      onChange={onChange}
    />
  );
})(
  ({ width, thumbWidth }) => `
  height: 10px;
  color: #ffffff;
  width: ${width - thumbWidth}px;
  & .MuiSlider-thumb {
    border-radius: 0;
    width: ${thumbWidth}px;
    height: 11px;
    color: #fafafa;
    border-radius: 5px;
    &:focus,
    &:hover,
    &.Mui-active {
      box-shadow: none;
    }
    &.Mui-focusVisible {
      box-shadow: none;
    }
  }
  & .MuiSlider-track {
    display: none;
  }
  & .MuiSlider-rail {
    position: absolute;
    left: 50%;
    transform: translate(-50%, -5px);
    border-radius: 5px;
    width: ${width}px;
    background-color: red;
  }
`
);
