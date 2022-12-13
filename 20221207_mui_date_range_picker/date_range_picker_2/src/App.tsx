import { LocalizationProvider, PickersDay, PickersDayProps } from '@mui/x-date-pickers'
import { DatePicker1 } from './DatePicker1'
import DatePicker2 from './DatePicker2'
import DateRangeCalendar from './DateRangeCalendar'
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import ja from "date-fns/locale/ja";
import { subMonths, addMonths, addDays, isEqual, isBefore, isAfter, isSunday, isSaturday, startOfDay, lastDayOfMonth, startOfMonth } from "date-fns";
import { useState } from 'react';
import { createTheme, SxProps, ThemeProvider } from '@mui/material';
import type { } from '@mui/x-date-pickers/themeAugmentation';

interface DateRange {
  start: Date | null;
  end: Date | null;
}

interface Props {
  dateRange: DateRange;
}

function isLimitDate(date: Date, dateRange: DateRange): boolean {
  return !!(dateRange.start && isEqual(date, dateRange.start)) || !!(dateRange.end && isEqual(date, dateRange.end))
}

function isInRange(date: Date, dateRange: DateRange): boolean {
  if (!dateRange.start || !dateRange.end) return false
  return isAfter(date, dateRange.start) && isBefore(date, dateRange.end)
}

function isStartOfMonth(date: Date) {
  return isEqual(date, startOfMonth(date))
}

function isEndOfMonth(date: Date) {
  return isEqual(date, lastDayOfMonth(date))
}

function makeSx(date: Date, dateRange: DateRange): SxProps {
  if (isInRange(date, dateRange)) {
    if (isSunday(date) || isStartOfMonth(date)) {
      return {
        backgroundColor: "#AAFFFF",
        "&::after": {
          content: "''",
          position: "absolute",
          height: "36px",
          backgroundColor: "#AAFFFF",
          zIndex: -1,
          width: "40px",
          transform: "translateX(50%)",
        }
      }
    }
    if (isSaturday(date) || isEndOfMonth(date)) {
      return {
        backgroundColor: "#AAFFFF",
        "&::after": {
          content: "''",
          position: "absolute",
          height: "36px",
          backgroundColor: "#AAFFFF",
          zIndex: -1,
          width: "40px",
          transform: "translateX(-50%)",
        }
      }
    }
    return {
      backgroundColor: "#AAFFFF",
      "&::after": {
        borderRadius: 0,
        content: "''",
        position: "absolute",
        width: "80px",
        height: "36px",
        backgroundColor: "#AAFFFF",
        zIndex: -1,
      }
    }
  }
  return {}
}

function PickersDayFn({ dateRange }: Props) {
  return (
    day: Date,
    selectedDays: Date[],
    pickersDayProps: PickersDayProps<Date>,
  ) => {
    return (<PickersDay<Date>
      {...pickersDayProps}
      sx={makeSx(day, dateRange)}
      selected={isLimitDate(day, dateRange)}
    />)
  }
}
const theme = createTheme({
  components: {
    MuiPickersDay: {
      styleOverrides: {
        root: {
          "&:hover": {
            backgroundColor: "#EEEEEE",
          }
        },
      },
    },
  }
});

function App() {
  const [dateRange, setDateRange] = useState<DateRange>({ start: startOfDay(new Date()), end: addDays(startOfDay(new Date()), 2) })
  return (
    <div className="App">
      <ThemeProvider theme={theme}>
        <LocalizationProvider
          dateAdapter={AdapterDateFns}
          adapterLocale={ja}
          dateFormats={{ monthAndYear: "yyyy年MM月" }}
          localeText={{
            previousMonth: "前月",
            nextMonth: "翌月",
          }}
        >
          <DateRangeCalendar
            dateRange={dateRange}
            onChange={(dateRange) => dateRange && setDateRange(dateRange)}
            minDate={subMonths(new Date(), 4)}
            maxDate={addMonths(new Date(), 4)}
            renderDay={PickersDayFn({ dateRange })}
          />
        </LocalizationProvider>
        <DatePicker1 />
        {/*<DatePicker2 />*/}
      </ThemeProvider>
    </div>
  )
}

export default App
