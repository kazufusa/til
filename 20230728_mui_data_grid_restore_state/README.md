# Valid properties to set in the DataGrid initialState

1. `pinnedColumns`: Species the initial pinned column names.
2. `columns.orderedFields`: Specifies the initial sorting order for columns.
3. `columns.columnVisibilityModel`: Specifies the initial hidden columns.

```typescript
const initialState = {
  pinnedColumns: { left: ["col1"] }, // This works!
  columns: {
    orderedFields: ["col1", "col3", "col2"], // This works!
    columnVisibilityModel: { col3: false }, // This works!
    lookup: { // This is not working
      "col1": {
        width: 10,
        minWidth: null,
        maxWidth: null,
      },
      "col2": {
        width: 10,
        minWidth: null,
        maxWidth: null,
        computedWidth: 1000,
      }
    },
  },
};
```
