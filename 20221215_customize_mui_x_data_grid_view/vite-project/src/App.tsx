import "./App.css";
import Table from "./Table";
import { ThemeProvider } from "@mui/material/styles";
import appThemeeme from "./AppTheme";

function App() {
  return (
    <div className="App">
      <ThemeProvider theme={appThemeeme}>
        <Table />
      </ThemeProvider>
    </div>
  );
}

export default App;
