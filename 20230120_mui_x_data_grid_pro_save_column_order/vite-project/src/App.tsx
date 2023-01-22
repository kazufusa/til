import React from "react";
import Table from "./Table";

function App() {
  const [showTable, setShowTable] = React.useState<boolean>(false);
  return (
    <div className="App">
      <p>
        <button onClick={() => setShowTable((v) => !v)}>テーブル表示</button>
      </p>
      {showTable && <Table name="test-table" />}
    </div>
  );
}

export default App;
