import { useState } from "react";
import reactLogo from "./assets/react.svg";
import "./App.css";
import Table from "./Table";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="App">
      <Table />
    </div>
  );
}

export default App;
