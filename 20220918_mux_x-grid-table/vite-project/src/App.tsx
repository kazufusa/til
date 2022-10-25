import * as React from 'react';
import { useState } from 'react'
import reactLogo from './assets/react.svg'
import './App.css'
import Box from '@mui/material/Box';
import { DataGrid, GridToolbar, GridColumnVisibilityModel, GridColumns, GridRowModel, GridColumnHeaderParams } from '@mui/x-data-grid';
import CssBaseline from '@mui/material/CssBaseline'
import Button from '@mui/material/Button'
import ThumbUp from '@mui/icons-material/ThumbUp'
import { usePersistedState } from './usePersistedState';
import { Popover, styled, Tooltip, tooltipClasses, TooltipProps } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
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

const LightTooltip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} classes={{ popper: className }}  />
))(({ theme }) => ({
  [`& .${tooltipClasses.tooltip}`]: {
    backgroundColor: theme.palette.common.white,
    color: 'rgba(0, 0, 0, 0.87)',
    boxShadow: theme.shadows[1],
    fontSize: 14,
    maxWidth: 200,
  },
}));

const BasicColumnsGrid: React.FC<Props> = ({ mode }) => {

  const rows1: Record[] = [
    { id: 1, username: 'aaa "aaa\nbbb" AAAAA AAA ', age: 20, },
    { id: 2, username: 'bbb BBB', age: 30, },
    { id: 3, username: 'ccc CCC', age: 40, },
    { id: 4, username: 'ccc CCC', age: 40, },
    { id: 5, username: 'ccc CCC', age: 40, },
    { id: 6, username: 'ccc CCC', age: 40, },
    { id: 7, username: 'ccc CCC', age: 40, },
    { id: 8, username: 'ccc CCC', age: 40, },
    { id: 9, username: 'ccc CCC', age: 40, },
    { id: 10, username: 'ccc CCC', age: 41, },
    { id: 11, username: 'ccc CCC', age: 42, },
    { id: 12, username: 'ccc CCC', age: 43, },
    { id: 13, username: 'ccc CCC', age: 44, },
    { id: 14, username: 'ccc CCC', age: 45, },
    { id: 15, username: 'ccc CCC', age: 46, },
    { id: 16, username: 'ccc CCC', age: 47, },
    { id: 17, username: 'ccc CCC', age: 48, },
    { id: 18, username: 'ccc CCC', age: 49, },
    { id: 19, username: 'ccc CCC', age: 50, },
    { id: 20, username: 'ccc CCC', age: 51, },
    { id: 21, username: 'ccc CCC', age: 52, },
    { id: 22, username: 'ccc CCC', age: 53, },
    { id: 23, username: 'ccc CCC', age: 54, },
    { id: 24, username: 'ccc CCC', age: 55, },
    { id: 25, username: 'ccc CCC', age: 56, },
    { id: 26, username: 'ccc CCC', age: 57, },
    { id: 27, username: 'ccc CCC', age: 58, },
  ]
  const columns1: GridColumns = [
    {
      field: 'username',
      width: Math.max.apply(null, rows1.map((v) => getTextWidth(v.username ?? "", `400 0.875rem "Roboto","Helvetica","Arial",sans-serif`))),
    },
    {
      field: 'age',
      width: 150,
      renderHeader: (params: GridColumnHeaderParams) => (
        <div>
          {'age '}
          <LightTooltip title="私は二週間頑張ってお仕事しましたのでお休みをいただきます。">
            <InfoOutlinedIcon color="primary" sx={{ verticalAlign: "-7px" }} />
          </LightTooltip>
        </div>
      )
    },
  ]

  const rows2: Record[] = [
    { id: 1, firstname: 'aaa', lastname: 'AAA', age: 20, },
    { id: 2, firstname: 'bbb', lastname: 'BBB', age: 30, },
    { id: 3, firstname: 'ccc', lastname: 'CCC', age: 40, },
  ]
  const columns2 = [{ field: 'firstname' }, { field: 'lastname' }, { field: 'age' }]

  const [a, setA] = usePersistedState<GridColumnVisibilityModel>("columnVisibilityModel", initialVisibilityModel)
  const fieldBlackList = ['age']
  const fields = (mode ? columns1 : columns2).map((v) => v.field).filter((v) => !fieldBlackList.includes(v))

  return (
    <Box sx={{ height: 250, width: '100%' }}>
      <DataGrid
        componentsProps={{
          toolbar: {
            csvOptions: { allColumns: true, utf8WithBom: true, fields: fields },
            printOptions: { disableToolbarButton: true },
          }
        }}
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
