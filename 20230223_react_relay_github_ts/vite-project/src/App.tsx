import { Suspense } from "react";
import "./App.css";
import { relayEnv } from "./relayEnv";
import { RelayEnvironmentProvider } from "react-relay";
import { Repository } from "./Repository";

function App() {
  return (
    <div className="App">
      <RelayEnvironmentProvider environment={relayEnv}>
        <Suspense fallback={"Loading..."}>
          <Repository />
        </Suspense>
      </RelayEnvironmentProvider>
    </div>
  );
}

export default App;
