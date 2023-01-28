# Add extra field to export CSV with MUI X DataGrid

To define a column in MUI X DataGrid that is not displayed but included in CSV output, you can set the 'hide' property to true and 'hideable' to false in the column definition.

```tsx
const columns: GridColumns = [
  { field: "jobTitle", headerName: "Job Title", width: 200 },
  {
    field: "recruitmentDate",
    headerName: "Recruitment Date",
    type: "date",
    width: 150,
  },
  {
    field: "contract",
    headerName: "Contract Type",
    type: "singleSelect",
    valueOptions: ["full time", "part time", "intern"],
    width: 150,
    renderCell: (params) => <p>!<strong>{params.value}</strong>!</p>
  },
  {
    // hidden column
    field: "test",
    headerName: "Test",
    filterable: false,
    hide: true,
    hideable: false,
  },
];
```

Then in the 'componentProps.toolbar.csvOptions', configure the desired column to be displayed.

```tsx
<DataGrid
  rows={rows}
  columns={columns}
  components={{ Toolbar: CustomToolbar }}
  componentsProps={{
    toolbar: {
      csvOptions: {
        allColumns: true
      }
    }
  }}
/>
```

This column will not be visible on the web UI, but it will appear as an option (disabled) in the column display/hide panel.
If you want to improve the appearance, it is recommended to create your own column display/hide panel
