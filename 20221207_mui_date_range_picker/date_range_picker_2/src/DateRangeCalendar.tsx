import { Box } from "@mui/material";
import { CalendarPicker, PickersDayProps } from "@mui/x-date-pickers";
import { subMonths, addMonths, max, min, startOfMonth, startOfDay } from "date-fns";
import { useState } from "react";

interface DateRange<TDate> {
  start: TDate | null;
  end: TDate | null;
}

interface DateRangeCalendarProps<TDate> {
  dateRange: DateRange<TDate>;
  onChange: (dateRange: DateRange<TDate> | null) => void;
  minDate: TDate;
  maxDate: TDate;
  renderDay: (day: TDate, selectedDays: TDate[], pickersDayProps: PickersDayProps<TDate>) => JSX.Element;
}


function normalizeDateRange(dateRange: DateRange<Date>): DateRange<Date> {
  if (dateRange.start && dateRange.end) {
    const [start, end] = [startOfDay(dateRange.start), startOfDay(dateRange.end)];
    return { start: min([start, end]), end: max([start, end]) }
  } else if (dateRange.start) {
    return { start: startOfDay(dateRange.start), end: null }
  } else if (dateRange.end) {
    return { start: startOfDay(dateRange.end), end: null }
  } else {
    return { start: null, end: null }
  }
}

function initialDefaultMonth(dateRange: DateRange<Date>): Date {
  if (dateRange.start) {
    return dateRange.start
  } else {
    return startOfMonth(new Date())
  }
}

function updateDateRange(current: DateRange<Date>, date: Date | null) {
  if (!date) return { ...current }
  if (current.start && !current.end) {
    return { start: min([current.start, date]), end: max([current.start, date]) };
  } else {
    return { start: date, end: null };
  }
}

export function DateRangeCalendar(props: DateRangeCalendarProps<Date>) {
  const [defaultMonth, setDefaultMonth] = useState<Date>(initialDefaultMonth(props.dateRange))
  const [dateRange, setDateRange] = useState<DateRange<Date>>(normalizeDateRange(props.dateRange))
  const onChange = (v: Date | null) => {
    if (!v) return
    const newDateRange = updateDateRange(dateRange, startOfDay(v));
    setDateRange(newDateRange);
    props.onChange(newDateRange);
  };
  return (
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
          date={defaultMonth}
          views={["day"]}
          components={{ RightArrowButton: () => null }}
          renderDay={props.renderDay}
          defaultCalendarMonth={defaultMonth}
          onChange={onChange}
          minDate={props.minDate}
          maxDate={props.maxDate}
          onMonthChange={(v) => v && setDefaultMonth(v)}
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
          date={addMonths(defaultMonth, 1)}
          views={["day"]}
          components={{ LeftArrowButton: () => null }}
          renderDay={props.renderDay}
          defaultCalendarMonth={addMonths(defaultMonth, 1)}
          onChange={onChange}
          minDate={props.minDate}
          maxDate={props.maxDate}
          onMonthChange={(v) => v && setDefaultMonth(subMonths(v, 1))}
        />
      </Box>
    </Box>
  );
}

export default DateRangeCalendar;
