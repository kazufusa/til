import { Suspense } from "react";
import "./App.css";
import { relayEnv } from "./relayEnv";
import { RelayEnvironmentProvider } from "react-relay";
import { SingleRepository } from "./SingleRepository";
import { RepositorySearch } from "./RepositorySearch";
import { Search } from "./Search";
import { StyledForm as Form } from "./Form";

function App() {
  return (
    <div className="App">
      <RelayEnvironmentProvider environment={relayEnv}>
        <Suspense fallback={<p>Loading...</p>}>
          <Form />
          <SingleRepository />
          <Search />
          <RepositorySearch />
        </Suspense>
      </RelayEnvironmentProvider>
    </div>
  );
}

export default App;
