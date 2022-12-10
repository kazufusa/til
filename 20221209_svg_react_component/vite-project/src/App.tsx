import { useState } from 'react'
import reactLogo from './assets/react.svg'
import './App.css'
import MyIcon from "./Icon"
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import SvgIcon from '@mui/material/SvgIcon';

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="App">
      <SvgIcon style={{ fontSize: "50px", color: "red", backgroundColor: "blue" }}>
        <svg viewBox="0 0 115.31312 58.666667">
          <g transform="translate(-31.037578,-68.000001)">
            <path
              style={{ "fill": "#000000;stroke-width:0.666667" }}
              d="m 50.23965,125.07562 c -26.075519,-9.69198 -25.438046,-46.728712 0.960618,-55.811185 3.16078,-1.087467 5.670324,-1.264434 17.93106,-1.264434 h 14.255927 l -0.193627,5.5 -0.193627,5.5 -14,0.333334 c -15.089983,0.359286 -16.521112,0.65552 -20.866108,4.319146 -1.209693,1.019994 -3.002135,3.390454 -3.983204,5.267694 -1.464634,2.80252 -1.786748,4.307693 -1.800456,8.41316 -0.01438,4.307445 0.2556,5.491585 1.949177,8.549035 2.010288,3.62922 5.334647,6.75584 8.771295,8.24955 1.246404,0.54174 6.884721,0.96177 15.929296,1.18666 l 14,0.34809 0.193627,5.5 0.193627,5.5 -14.52696,-0.0347 C 55.422754,126.5998 54.026337,126.48309 50.23965,125.07562 Z m 43.900058,-3.90895 0.193627,-5.5 14.000005,-0.33333 c 12.91961,-0.30761 14.24211,-0.45259 17.13736,-1.87862 4.03578,-1.9878 6.70575,-5.0672 8.46096,-9.75842 1.83967,-4.916952 1.78607,-9.178652 -0.16806,-13.362965 -2.15869,-4.622347 -4.58796,-7.296794 -8.27916,-9.114727 -2.91209,-1.434227 -4.21302,-1.577227 -17.1511,-1.885273 l -14.000005,-0.333334 -0.193627,-5.5 -0.193626,-5.5 h 14.255928 c 12.5615,0 14.72395,0.160127 18.19363,1.34724 10.66134,3.647647 17.8492,12.33676 19.6078,23.703087 2.14396,13.856962 -5.81362,27.233762 -19.06138,32.042442 -4.05198,1.47079 -5.27482,1.5739 -18.66601,1.5739 H 93.946082 Z M 65.333335,97.333335 v -6 H 88.666668 112 v 6 6.000005 H 88.666668 65.333335 Z" />
          </g>
        </svg>
      </SvgIcon>

      <ArrowBackIosIcon />
      <MyIcon height="1px" />
      <SvgIcon style={{ fontSize: "50px", color: "gray" }}>
        <path d="M 5 20 L 20 5 L 35 20 L 20 20" />
      </SvgIcon>
      <br />
      <SvgIcon style={{ fontSize: "100px", color: "gray" }}>
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
      </SvgIcon>
      <SvgIcon color="primary" style={{ fontSize: "100px" }}>
        <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
      </SvgIcon>
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src="/vite.svg" className="logo" alt="Vite logo" />
        </a>
        <a href="https://reactjs.org" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </div>
  )
}

export default App
