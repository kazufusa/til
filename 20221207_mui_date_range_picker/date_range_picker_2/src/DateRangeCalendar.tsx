import { Box } from "@mui/material";
import { CalendarPicker, PickersDayProps } from "@mui/x-date-pickers";
import { subMonths, addMonths, max, min } from "date-fns";
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

interface IDateRangeCalendarModel<TDate> {
  readonly dateRange: DateRange<TDate>;
  readonly onChange: (dateRange: DateRange<TDate> | null) => void;
  readonly minDate: TDate;
  readonly maxDate: TDate;
  handleOnChange(date: TDate | null): IDateRangeCalendarModel<TDate>;
  handleOnMonthChange1(date: TDate | null): IDateRangeCalendarModel<TDate>;
  handleOnMonthChange2(date: TDate | null): IDateRangeCalendarModel<TDate>;
  getRange(): DateRange<TDate>;
  getDefaultMonth1(): TDate;
  getDefaultMonth2(): TDate;
  getMinDate(): TDate;
  getMaxDate(): TDate;
}

class DateRangeCalendarModel implements IDateRangeCalendarModel<Date> {
  static initialDefaultMonth(dateRange: DateRange<Date>): Date {
    if (dateRange.start) {
      return dateRange.start
    } else {
      return new Date()
    }
  }
  readonly defaultMonth: Date;
  constructor(
    readonly dateRange: DateRange<Date>,
    readonly onChange: (dateRange: DateRange<Date> | null) => void,
    readonly minDate: Date,
    readonly maxDate: Date,
    defaultMonth?: Date,
  ) {
    this.defaultMonth = defaultMonth ?? DateRangeCalendarModel.initialDefaultMonth(dateRange);
  }

  copy({ dateRange, onChange, minDate, maxDate, defaultMonth }: {
    dateRange?: DateRange<Date>,
    onChange?: (dateRange: DateRange<Date> | null) => void,
    minDate?: Date,
    maxDate?: Date,
    defaultMonth?: Date,
  }) {
    return new DateRangeCalendarModel(
      dateRange ?? { ...this.dateRange },
      onChange ?? this.onChange,
      minDate ?? this.minDate,
      maxDate ?? this.maxDate,
      defaultMonth ?? this.defaultMonth,
    )
  }
  getRange() {
    return this.dateRange;
  }

  handleOnChange(date: Date | null): DateRangeCalendarModel {
    if (!date) return this.copy({});
    if (this.dateRange.start && !this.dateRange.end) {
      return this.copy({ dateRange: { start: min([this.dateRange.start, date]), end: max([this.dateRange.start, date]) } });
    } else {
      return this.copy({ dateRange: { start: date, end: null } });
    }
  }

  handleOnMonthChange1(date: Date | null): DateRangeCalendarModel {
    return this.copy(date ? { defaultMonth: date } : {})
  };

  handleOnMonthChange2(date: Date | null): DateRangeCalendarModel {
    return this.copy(date ? { defaultMonth: subMonths(date, 1) } : {})
  };

  getDefaultMonth1(): Date { return this.defaultMonth };

  getDefaultMonth2(): Date { return addMonths(this.defaultMonth, 1) };

  getMinDate(): Date { return this.minDate };
  getMaxDate(): Date { return this.maxDate };
}

function newDateRangeFn(current: DateRange<Date>) {
  return (date: Date | null) => {
    if (!date) return { ...current }
    if (current.start && !current.end) {
      return { start: min([current.start, date]), end: max([current.start, date]) };
    } else {
      return { start: date, end: null };
    }
  }
}

export function DateRangeCalendar(props: DateRangeCalendarProps<Date>) {
  const [defaultMonth, setDefaultMonth] = useState<Date>(() => {
    return DateRangeCalendarModel.initialDefaultMonth(props.dateRange)
  })
  const [dateRange, setDateRange] = useState<DateRange<Date>>(props.dateRange);
  const onChange = (v: Date | null) => {
    setDateRange((newDateRangeFn(dateRange))(v));
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
          onMonthChange={ (v) => v && setDefaultMonth(subMonths(v, 1)) }
        />
      </Box>
    </Box>
  );
}

export default DateRangeCalendar;
