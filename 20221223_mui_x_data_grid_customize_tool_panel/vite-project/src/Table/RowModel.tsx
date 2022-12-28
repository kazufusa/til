import { GridValidRowModel } from "@mui/x-data-grid";
import { Age } from "./Age";

interface RowModel extends GridValidRowModel {
  id: number;
  lastName: string;
  firstName: string;
  age: Age;
};

export default RowModel;
