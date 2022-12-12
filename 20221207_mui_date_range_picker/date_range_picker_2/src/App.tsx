import { LocalizationProvider, PickersDay, PickersDayProps } from '@mui/x-date-pickers'
import { DatePicker1 } from './DatePicker1'
import DatePicker2 from './DatePicker2'
import DateRangeCalendar from './DateRangeCalendar'
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import ja from "date-fns/locale/ja";
import { subMonths, addMonths } from "date-fns";


function App() {
  return (
    <div className="App">
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
          dateRange={{ start: null, end: null }}
          onChange={() => { }}
          minDate={subMonths(new Date(), 4)}
          maxDate={addMonths(new Date(), 4)}
          renderDay={(day: Date, selectedDays: Date[], pickersDayProps: PickersDayProps<Date>) => {
            return (<PickersDay<Date>
              {...pickersDayProps}
              selected={false}
            />)
          }
          }
        />
      </LocalizationProvider>
      <DatePicker1 />
      {/*<DatePicker2 />*/}
    </div>
  )
}

export default App
