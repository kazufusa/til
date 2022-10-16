import * as React from 'react';
import { useState } from 'react'
import reactLogo from './assets/react.svg'
import './App.css'
import Box from '@mui/material/Box';
import { DataGrid, GridToolbar, GridColumnVisibilityModel, GridColumns } from '@mui/x-data-grid';
import CssBaseline from '@mui/material/CssBaseline'
import Button from '@mui/material/Button'
import ThumbUp from '@mui/icons-material/ThumbUp'
import { usePersistedState } from './usePersistedState';

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

const initialVisibilityModel: VisibilityModel<Record> = {
  username: true,
  firstname: true,
  lastname: true,
  age: true,
}

const canvas = document.createElement("canvas")
function getTextWidth(text: string, font: string): number {
  const context = canvas.getContext("2d");
  if (context === null) return 200;
  context.font = font
  const metrics = context.measureText(text);
  console.log(text, metrics.width)
  return Math.ceil(metrics.width) + 40;
}

const BasicColumnsGrid: React.FC<Props> = ({ mode }) => {

  const rows1: Record[] = [
    { id: 1, username: 'aaa AAAAA AAA ', age: 20, },
    { id: 2, username: 'bbb BBB', age: 30, },
    { id: 3, username: 'ccc CCC', age: 40, },
  ]
  const columns1: GridColumns = [
    { field: 'username', width: Math.max.apply(null, rows1.map((v) => getTextWidth(v.username ?? "", `400 0.875rem "Roboto","Helvetica","Arial",sans-serif`))) },
    { field: 'age' },
  ]

  const rows2: Record[] = [
    { id: 1, firstname: 'aaa', lastname: 'AAA', age: 20, },
    { id: 2, firstname: 'bbb', lastname: 'BBB', age: 30, },
    { id: 3, firstname: 'ccc', lastname: 'CCC', age: 40, },
  ]
  const columns2 = [{ field: 'firstname' }, { field: 'lastname' }, { field: 'age' }]

  const [a, setA] = usePersistedState<GridColumnVisibilityModel>("columnVisibilityModel", initialVisibilityModel)

  return (
    <Box sx={{ height: 250, width: '100%' }}>
      <DataGrid
        columnVisibilityModel={a}
        sortingOrder={['desc', 'asc']}
        onColumnVisibilityModelChange={(model) => setA(model)}
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
