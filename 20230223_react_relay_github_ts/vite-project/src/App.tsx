import { Suspense } from "react";
import "./App.css";
import { relayEnv } from "./relayEnv";
import { RelayEnvironmentProvider } from "react-relay";
import { Repository } from "./Repository";
import { Search } from "./Search";

function App() {
  return (
    <div className="App">
      <RelayEnvironmentProvider environment={relayEnv}>
        <Suspense fallback={"Loading..."}>
          <Repository />
          <Search />
        </Suspense>
      </RelayEnvironmentProvider>
    </div>
  );
}

export default App;
