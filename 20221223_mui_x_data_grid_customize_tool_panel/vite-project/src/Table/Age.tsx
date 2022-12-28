import {
  GridComparatorFn,
  GridFilterOperator,
  GridFilterItem,
  GridFilterInputValue,
} from "@mui/x-data-grid";
import { RequireOne } from "../typeUtil";

export type Age = RequireOne<{
  value?: number;
  text?: string;
}>;

export const ageComparator: GridComparatorFn<number | string> = (v1, v2) => {
  if (typeof v1 === "number" && typeof v2 === "number") {
    return v1 - v2;
  } else if (typeof v1 === "number") {
    return 1;
  } else if (typeof v2 === "number") {
    return -1;
  } else {
    return v1 > v2 ? 1 : -1;
  }
};

export const ageOperators: GridFilterOperator[] = [
  {
    label: "Above",
    value: "above",
    getApplyFilterFn: (filterItem: GridFilterItem) => {
      if (
        !filterItem.columnField ||
        !filterItem.value ||
        !filterItem.operatorValue
      ) {
        return null;
      }
      return (params): boolean => {
        return Number(params.value) >= Number(filterItem.value);
      };
    },
    InputComponent: GridFilterInputValue,
    InputComponentProps: { type: "number" },
  },
  {
    label: "Is empty",
    value: "is empty",
    getApplyFilterFn: (filterItem: GridFilterItem) => {
      if (!filterItem.columnField || !filterItem.operatorValue) {
        return null;
      }

      return (params): boolean => {
        return typeof params.value === "string";
      };
    },
  },
];
