import { useState } from 'react'
import reactLogo from './assets/react.svg'
import './App.css'
import { graphql, RelayEnvironmentProvider, useQueryLoader } from 'react-relay'
import { relayEnv } from './relayEnv'
import { AppAllPostQuery } from './__generated__/AppAllPostQuery.graphql'

const AllPostQuery = graphql`
  query AppAllPostQuery{
      allPosts {
        id
        user_id
        title
        views
      }
    }
`;


function Component() {
  const [preload, load] =
    useQueryLoader<AppAllPostQuery>(AllPostQuery)

  return <></>
}


function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="App">
      <RelayEnvironmentProvider environment={relayEnv}>
        <Component />
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
      </RelayEnvironmentProvider>
    </div>
  )
}

export default App
