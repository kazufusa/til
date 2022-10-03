import * as React from "react";
import { Box, TextField, Grid } from "@mui/material";
import { LocalizationProvider, DatePicker } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { compareAsc, subDays } from "date-fns";
import ja from "date-fns/locale/ja";

class DateRange {
  start: Date;
  end: Date;

  constructor(date1: Date, date2: Date) {
    if (compareAsc(date1, date2) < 0) {
      this.start = date1;
      this.end = date2;
    } else {
      this.start = date2;
      this.end = date1;
    }
  }

  setStart(start: Date): DateRange {
    return new DateRange(start, this.end);
  }

  setEnd(end: Date): DateRange {
    return new DateRange(end, this.start);
  }
}

export function DatePickerSample() {
  const [value, setValue] = React.useState<DateRange>(
    new DateRange(subDays(new Date(), 1), subDays(new Date(), 30))
  );

  const handleChangeStart = (newValue: Date | null) => {
    newValue && setValue((value) => value.setStart(newValue));
  };

  const handleChangeEnd = (newValue: Date | null) => {
    newValue && setValue((value) => value.setEnd(newValue));
  };

  return (
    <LocalizationProvider
      dateAdapter={AdapterDateFns}
      adapterLocale={ja}
      dateFormats={{ monthAndYear: "yyyy年 MM月" }}
      localeText={{
        previousMonth: "前月",
        nextMonth: "翌月",
      }}
    >
      <Box sx={{ m: 2, width: "50ch" }}>
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <DatePicker
              label="開始"
              value={value.start}
              onChange={handleChangeStart}
              inputFormat="yyyy年MM月dd日"
              minDate={subDays(new Date(), 30)}
              maxDate={value.end}
              mask="____年__月__日"
              toolbarTitle="日付選択"
              showDaysOutsideCurrentMonth
              renderInput={(params) => (
                <TextField
                  {...params}
                  inputProps={{
                    ...params.inputProps,
                    placeholder: "****年**月**日",
                  }}
                />
              )}
            />
          </Grid>
          <Grid item xs={6}>
            <DatePicker
              label="終了"
              value={value.end}
              onChange={handleChangeEnd}
              inputFormat="yyyy年MM月dd日"
              minDate={value.start}
              maxDate={subDays(new Date(), 1)}
              mask="____年__月__日"
              toolbarTitle="日付選択"
              showDaysOutsideCurrentMonth
              renderInput={(params) => (
                <TextField
                  {...params}
                  inputProps={{
                    ...params.inputProps,
                    placeholder: "****年**月**日",
                  }}
                />
              )}
            />
          </Grid>
        </Grid>
      </Box>
    </LocalizationProvider>
  );
}
