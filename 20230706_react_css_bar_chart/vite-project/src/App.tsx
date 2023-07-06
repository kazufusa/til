import { Box, styled } from '@mui/material';
import './App.css'

function App() {
  return (
    <>
      <Box padding={0} position={"relative"} overflow={"hidden"}>
        <ChartBar min={-5} max={10} value={5} areaWidth={600} />
        <ChartBar min={-5} max={10} value={-3} areaWidth={600} />
        <ChartBar min={-5} max={10} value={13} areaWidth={600} />
        <YAxis style={{ left: "200px" }} />
      </Box>
    </>
  )
}

const YAxis = styled(`div`)`
  top: 0px;
  position: absolute;
  height: 100%;
  width: 0px;
  border: solid 1px blue;
`

interface BarProps {
  min: number;
  max: number;
  value: number;
  areaWidth: number;
  className?: string;
}

const ChartBar = styled(({ className, min, max, areaWidth, value }: BarProps) => {
  const scale = areaWidth / (max - min)
  const width = Math.abs(value) * scale
  const left = (Math.min(0, value) - min) * scale

  return (
    <Box className={className} sx={{ width: areaWidth }}>
      <Box className="bar" sx={{
        marginLeft: `${left}px`,
        width,
        borderRadius: 0 < value ? "0 10px 10px 0" : "10px 0 0 10px",
      }} />
    </Box>
  )
})`
  height: 20px;
  background-color: lightgray;
  .bar {
    height: 100%;
    background-color: red;
  }

`

export default App
