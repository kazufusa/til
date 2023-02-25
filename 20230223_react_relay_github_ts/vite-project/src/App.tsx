import { Suspense } from "react";
import "./App.css";
import { relayEnv } from "./relayEnv";
import { RelayEnvironmentProvider } from "react-relay";
import { Repository } from "./Repository";
import { RepositorySearch } from "./RepositorySearch";
import { Search } from "./Search";

function App() {
  return (
    <div className="App">
      <RelayEnvironmentProvider environment={relayEnv}>
        <Suspense fallback={<p>Loading...</p>}>
          <Repository />
          <Search />
          <RepositorySearch />
        </Suspense>
      </RelayEnvironmentProvider>
    </div>
  );
}

export default App;
