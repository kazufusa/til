import { Table } from "./Table";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import "./App.css";
function App() {
  return (
    <>
      <DndProvider backend={HTML5Backend}>
        <Table />
      </DndProvider>
    </>
  );
}

export default App;
