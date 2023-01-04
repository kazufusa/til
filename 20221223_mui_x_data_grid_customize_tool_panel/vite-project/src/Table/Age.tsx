import {
  GridComparatorFn,
  GridFilterOperator,
  GridFilterItem,
  GridFilterInputValue,
  getGridNumericOperators,
} from "@mui/x-data-grid";
import { RequireOne } from "../typeUtil";

const parseNumericValue = (
  value: string | number | null | undefined
): number | null => {
  if (value == null) {
    return null;
  }

  return Number(value);
};

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
  ...getGridNumericOperators().filter(
    (v) => !["isEmpty", "isNotEmpty", "isAnyOf"].includes(v.value)
  ),
  {
    value: "isEmpty",
    requiresFilterValue: false,
    getApplyFilterFn: (_: GridFilterItem) => {
      return (params): boolean => {
        return typeof params.value === "string";
      };
    },
  },
  {
    value: "isNotEmpty",
    requiresFilterValue: false,
    getApplyFilterFn: (_: GridFilterItem) => {
      return (params): boolean => {
        return typeof params.value !== "string";
      };
    },
  },
];
