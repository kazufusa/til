import Box from '@mui/material/Box';
import * as React from 'react';
import dayjs, { Dayjs } from 'dayjs';
import TextField from '@mui/material/TextField';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { CalendarPicker } from '@mui/x-date-pickers';
import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import { DateRangePicker } from './DateRangePicker'
import { PickersDay } from '@mui/x-date-pickers/PickersDay';
import { styled } from '@mui/material/styles';


export default function StaticDatePickerDemo() {
  const [start, setStart] = React.useState<Dayjs>(dayjs('2022-04-07'));
  const [end, setEnd] = React.useState<Dayjs>(dayjs('2022-05-07'));

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <CalendarPicker
        date={start}
        onChange={(date) => date && setStart(date)}
        views={["day"]}
      />
      <DateRangePicker startDate={start.toDate()} endDate={end.toDate()} />
      <Box display={"flex"}>
        <StaticDatePicker
    components
          minDate={start}
          views={["day"]}
          displayStaticWrapperAs="desktop"
          openTo="day"
          value={start}
          onChange={(newValue) => {
            newValue && setStart(newValue);
          }}
          onMonthChange={(value) => {
            setStart(value.startOf("month").subtract(1, "day"))
          }}
          renderInput={(params) => <TextField {...params} />}
        />
        <StaticDatePicker
          views={["day"]}
          displayStaticWrapperAs="desktop"
          openTo="day"
          value={end}
          onChange={(newValue) => {
            newValue && setEnd(newValue);
          }}
          renderInput={(params) => <TextField {...params} />}
          onMonthChange={(value) => { setStart(value) }}
        />
      </Box>
    </LocalizationProvider>
  );
};
