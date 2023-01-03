import { useState } from "react";
import "./App.css";
import Table from "./Table";
import { ThemeProvider, createTheme } from "@mui/material/styles";

function App() {
  const theme = createTheme();
  return (
    <div className="App">
      <ThemeProvider theme={theme}>
        <Table />
      </ThemeProvider>
    </div>
  );
}

export default App;
