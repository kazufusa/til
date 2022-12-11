import * as React from "react";
import { Box } from "@mui/material";
import { LocalizationProvider, CalendarPicker, PickersDay, CalendarPickerSkeleton, PickersDayProps } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { compareAsc, subDays } from "date-fns";
import ja from "date-fns/locale/ja";
import { PickerSelectionState } from "@mui/x-date-pickers/internals/hooks/usePickerState";
import { PickerOnChangeFn } from "@mui/x-date-pickers/internals/hooks/useViews";

export function DatePicker2() {
  const [value, setValue] = React.useState<Date>(subDays(new Date(), 100));
  const handleChangeStart: PickerOnChangeFn<Date> = (newValue: Date | null) => {
    newValue && setValue(newValue);
  };

  return (
    <LocalizationProvider
      dateAdapter={AdapterDateFns}
      adapterLocale={ja}
      dateFormats={{ monthAndYear: "yyyy年MM月" }}
      localeText={{
        previousMonth: "前月",
        nextMonth: "翌月",
      }}
    >
      <Box display="flex" justifyContent="center">
        <Box
          sx={
            {
              "& .MuiPickersCalendarHeader-root": {
                padding: "0 24px 0 24px",
                position: "relative",
                "& >:first-child": {
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  "& .MuiPickersCalendarHeader-label": {
                    margin: 0,
                  }
                },
                "& >:last-child": {
                  order: 1,
                }
              },
            }
          }
        >
          <CalendarPicker<Date>
            date={value}
            onChange={handleChangeStart}
            minDate={subDays(new Date(), 180)}
            maxDate={subDays(new Date(), -180)}
            views={["day"]}
            components={{ RightArrowButton: () => null }}
            onMonthChange={(date: Date) => console.log(date)}
          />
        </Box>
        <Box
          sx={
            {
              "& .MuiPickersCalendarHeader-root": {
                position: "relative",
                padding: "0 24px 0 24px",
                "& >:first-child": {
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  "& .MuiPickersCalendarHeader-label": {
                    margin: 0,
                  }
                },
                "& >:last-child": {
                  marginLeft: "auto",
                }
              },
            }
          }
        >
          <CalendarPicker<Date>
            date={null}
            defaultCalendarMonth={value}
            onChange={handleChangeStart}
            minDate={subDays(new Date(), 180)}
            maxDate={subDays(new Date(), -180)}
            views={["day"]}
            components={{ LeftArrowButton: () => null }}
            onMonthChange={(date: Date) => console.log(date)}
            renderDay={
              (day: Date, selectedDays: Date[], pickersDayProps: PickersDayProps<Date>) => {
                console.log(day, selectedDays)
                return (<PickersDay<Date>
                  {...pickersDayProps }
                  selected
                />)
              }
            }
          />
        </Box>
      </Box>

    </LocalizationProvider>
  );
}

export default DatePicker2;
