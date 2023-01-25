# Customize output csv

To customize the CSV output, first use `gridVisibleSortedRowIdsSelector(apiRef)` to get the data IDs of all currently viewable pages, then use `apiRef.current.getRow()` to get the row data corresponding to each ID, and and convert them to CSV.
