import { useState } from 'react'
import './App.css'
import { useInView } from 'react-intersection-observer';

function App() {
  const [value, setValue] = useState<number>(10)

  const { ref, inView } = useInView({
    onChange: (inView: boolean) => {
      inView && setValue((v) => v < 100 ? v + 10 : v)
    }
  });

  return (
    <div className="App">
      {
        [...Array(value).keys()].map((v) => (
          <p key={`${v}`}>{v}</p>
        ))
      }
      <div ref={ref}>
        <h2>{`Header inside viewport ${inView}.`}</h2>
      </div>
    </div>
  )
}

export default App
