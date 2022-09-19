import * as React from 'react';
import { useState } from 'react'
import reactLogo from './assets/react.svg'
import './App.css'
import Box from '@mui/material/Box';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import CssBaseline from '@mui/material/CssBaseline'
import Button from '@mui/material/Button'
import ThumbUp from '@mui/icons-material/ThumbUp'

function BasicColumnsGrid({ mode }) {
  const columns1 = [{ field: 'username' }, { field: 'age' }]
  const rows1 = [
    { id: 1, username: 'aaa AAA', age: 20, },
    { id: 2, username: 'bbb BBB', age: 30, },
    { id: 3, username: 'ccc CCC', age: 40, },
  ]

  const columns2 = [{ field: 'firstname' }, { field: 'secondname' }, { field: 'age' }]
  const rows2 = [
    { id: 1, firstname: 'aaa', secondname: 'AAA', age: 20, },
    { id: 2, firstname: 'bbb', secondname: 'BBB', age: 30, },
    { id: 3, firstname: 'ccc', secondname: 'CCC', age: 40, },
  ]

  const [columnVisibilityModel, setColumnVisibilityModel] = useState(
    {
      firstname: true,
      secondname: true,
      username: true,
      age: false,
    }
  );

  return (
    <Box sx={{ height: 250, width: '100%' }}>
      <DataGrid
        initialState={{
          columns: { columnVisibilityModel },
        }}
        onColumnVisibilityModelChange={(model) => setColumnVisibilityModel(model)}
        columns={mode ? columns1 : columns2}
        rows={mode ? rows1 : rows2}
        components={{
          Toolbar: GridToolbar,
        }}
      />
    </Box>
  );
}


export default function App() {
  const [mode, setMode] = useState(true);
  return (
    <>
      <CssBaseline />
      <Button variant="outlined" startIcon={<ThumbUp />} onClick={() => { setMode((v) => !v) }}>
        OK
      </Button>
      < BasicColumnsGrid mode={mode} />
    </>
  )
}
