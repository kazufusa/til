import React, { useState } from 'react'
import logo from './logo.svg'
import './App.css'


type Button = {
  label: string;
  onClick: (v: string) => string;
};

const buttons: Button[][] = [
  [
    { label: '7', onClick: (v: string) => v + '7' },
    { label: '8', onClick: (v: string) => v + '8' },
    { label: '9', onClick: (v: string) => v + '9' },
    {
      label: '+', onClick: (v: string) => /\d$/.test(v) ? v + '+' : v.slice(0, -1) + '+'
    },
  ],
  [
    { label: '4', onClick: (v: string) => v + '4' },
    { label: '5', onClick: (v: string) => v + '5' },
    { label: '6', onClick: (v: string) => v + '6' },
    {
      label: '-', onClick: (v: string) => /[\-]$/.test(v) ? v : v + '-'
    },
  ],
  [
    { label: '1', onClick: (v: string) => v + '1' },
    { label: '2', onClick: (v: string) => v + '2' },
    { label: '3', onClick: (v: string) => v + '3' },
    {
      label: '*', onClick: (v: string) => /\d$/.test(v) ? v + '*' : v.slice(0, -1) + '*'
    },
  ],
  [
    { label: '0', onClick: (v: string) => v + '0' },
    { label: 'AC', onClick: () => '' },
    {
      label: '=', onClick: (v: string) => {
        try {
          const _v = Function(`return ${v}`)()
          return _v === undefined ? v : _v
        } catch {
          return v
        }
      }
    },
    {
      label: '/', onClick: (v: string) => /\d$/.test(v) ? v + '/' : v.slice(0, -1) + '/'
    },
  ],
]

const App: React.FC = () => {
  const [value, setValue] = useState<string>('')

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>Hello Vite + React!</p>
        <input
          type='text'
          style={{ width: '200px', height: '30px', textAlign: 'right', paddingRight: '4px' }}
          readOnly={true}
          value={value}
        />
        <table>
          <tbody>
            {
              buttons.map((row, i) => (
                <tr key={`buttonTr-${i}`}>
                  {row.map((col, j) => (
                    <td key={`buttonTd-${j}`}>
                      <button
                        type="button"
                        style={{ width: '50px' }}
                        onClick={() => setValue(col.onClick)}
                      >
                        {col.label}
                      </button>
                    </td>
                  )
                  )}
                </tr>
              ))
            }
          </tbody>
        </table>
        <p>
          Edit <code>App.tsx</code> and save to test HMR updates.
        </p>
        <p>
          <a
            className="App-link"
            href="https://reactjs.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn React
          </a>
          {' | '}
          <a
            className="App-link"
            href="https://vitejs.dev/guide/features.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vite Docs
          </a>
        </p>
      </header>
    </div >
  )
}

export default App
