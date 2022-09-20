import * as React from 'react';
import { useState } from 'react'
import reactLogo from './assets/react.svg'
import './App.css'
import Box from '@mui/material/Box';
import { DataGrid, GridToolbar, GridColumnVisibilityModel } from '@mui/x-data-grid';
import CssBaseline from '@mui/material/CssBaseline'
import Button from '@mui/material/Button'
import ThumbUp from '@mui/icons-material/ThumbUp'
import useLocalStorageState from 'use-local-storage-state'

interface Props {
  mode: boolean
}

interface Record {
  id: number
  username?: string
  firstname?: string
  lastname?: string
  age: number
}

type VisibilityModel<T> = {
  [K in keyof Omit<T, 'id'>]: boolean
}

const initialVisibilityModel: VisibilityModel<Record> = Object.apply({
  username: true,
  firstname: true,
  lastname: true,
  age: true,
}, JSON.parse(localStorage.getItem('tableVisibilityModel') || '{}'))

const BasicColumnsGrid: React.FC<Props> = ({ mode }) => {
  const columns1 = [{ field: 'username' }, { field: 'age' }]
  const rows1: Record[] = [
    { id: 1, username: 'aaa AAA', age: 20, },
    { id: 2, username: 'bbb BBB', age: 30, },
    { id: 3, username: 'ccc CCC', age: 40, },
  ]

  const columns2 = [{ field: 'firstname' }, { field: 'lastname' }, { field: 'age' }]
  const rows2: Record[] = [
    { id: 1, firstname: 'aaa', lastname: 'AAA', age: 20, },
    { id: 2, firstname: 'bbb', lastname: 'BBB', age: 30, },
    { id: 3, firstname: 'ccc', lastname: 'CCC', age: 40, },
  ]

  const [columnVisibilityModel, setColumnVisibilityModel] = useLocalStorageState<GridColumnVisibilityModel>(
    'tableVisibilityModel', { defaultValue: initialVisibilityModel });

  return (
    <Box sx={{ height: 250, width: '100%' }}>
      <DataGrid
        initialState={{
          columns: { columnVisibilityModel },
        }}
        sortingOrder={['desc', 'asc']}
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
