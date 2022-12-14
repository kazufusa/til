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
    return {
      backgroundColor: "#AAFFFF",
      "&::after": {
        borderRadius: 0,
        content: "''",
        position: "absolute",
        width: "60px",
        height: "24px",
        backgroundColor: "#AAFFFF",
        zIndex: -1,
        ...(
          (isSunday(date) || isStartOfMonth(date)) ? {
            width: "30px",
            transform: "translateX(50%)",
          } : {}
        ),
        ...(
          (isSaturday(date) || isEndOfMonth(date)) ? {
            width: "30px",
            transform: "translateX(-50%)",
          } : {}
        ),
        ...(
          (isSaturday(date) && isStartOfMonth(date)) ? {
            width: "0px",
          } : {}
        ),
        ...(
          (isSunday(date) && isEndOfMonth(date)) ? {
            width: "0px",
          } : {}
        ),
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
    PrivatePickersSlideTransition: {
      styleOverrides: {
        root: {
          minHeight: "160px!important",
        }
      }
    },
    MuiPickersCalendarHeader: {
      styleOverrides: {
        root: {
          "& .MuiPickersCalendarHeader-label": {
            fontSize: "13px!important",
            margin: "0 3px 0 3px",
          }
        },
      },
    },
    MuiCalendarPicker: {
      styleOverrides: {
        root: {
          width: "220px",
          maxHeight: "250px",
          overflow: "hidden",
          "& span": {
            width: "24px",
            height: "24px",
            margin: "0 3px 0 3px",
          },
        },
      },
    },
    MuiPickersDay: {
      styleOverrides: {
        root: {
          width: "24px",
          height: "24px",
          margin: "0 3px 0 3px",
          lineHeight: "0",
          "&:hover": {
            backgroundColor: "#EEEEEE",
          },
          "&.Mui-selected": {
            backgroundColor: "#1976D2",
          },
          "&.Mui-selected:hover": {
            backgroundColor: "#1976D2",
          },
          "&:focus.Mui-selected": {
            backgroundColor: "#1976D2",
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
