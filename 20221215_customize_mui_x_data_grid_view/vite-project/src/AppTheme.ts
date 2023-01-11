import { createTheme } from "@mui/material/styles";

const theme = createTheme({ components: { MuiAutocomplete: { styleOverrides: { root: { color: "blue", fontSize: "20rem", background: "red" } } } } });
export default theme;
