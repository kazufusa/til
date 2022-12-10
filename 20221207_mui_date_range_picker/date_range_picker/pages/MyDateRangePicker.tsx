import { styled, Theme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import { PickersDay } from '@mui/x-date-pickers/PickersDay';
import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import { Dayjs } from 'dayjs';

interface MyDatePickerProps {
  currentDate: Dayjs;
  rangeStartDate: Dayjs | null;
  rangeEndDate: Dayjs | null;
  minDate: Dayjs;
  maxDate: Dayjs;
  onChange: (value: Dayjs) => void;
  onMonthChange: (value: Dayjs) => void;
}
export const DateRangePickerCustomPickersDay = styled(PickersDay)(
  ({ theme }: { theme: Theme }) => ({
    ...{
      margin: '0',
      transition: 'none',
      '&.Mui-selected ': {
        backgroundColor: theme?.palette.primary.main,
      },
      '&:focus.Mui-selected': {
        backgroundColor: "blue", //theme?.palette.primary.main,
      },
      '&:hover.Mui-selected': {
        backgroundColor: "blue", //theme?.palette.primary.main,
      },
    },
    ...(between
      ? {
        borderRadius: 0,
        backgroundColor: "blue", //theme?.palette.primary.main,
        color: "white", //theme?.palette.common.white,
        '&:hover, &:focus &.Mui-selected': {
          backgroundColor: "blue", //theme?.palette.primary.main,
        },
      }
      : null),
    ...(first
      ? {
        borderTopLeftRadius: '50%',
        borderBottomLeftRadius: '50%',
      }
      : null),
    ...(last
      ? {
        borderTopRightRadius: '50%',
        borderBottomRightRadius: '50%',
        '&.Mui-selected': {},
      }
      : null),
  }),
) as React.ComponentType<TPickersDayProps>;

const renderSelectedDays = (
  day: Date,
  selectedDays: Date[],
  props: MyDatePickerProps,
) => {
  if (!startDateState) {
    return (
      <DateRangePickerCustomPickersDay
        {...pickersDayProps}
        between={0}
        first={0}
        last={0}
        selected={false}
      />
    );
  }
  const currentDate = dayjs(day);
  const startDate = dayjs(startDateState);
  const endDate = dayjs(endDateState);
  const between =
    currentDate.isSameOrAfter(startDate, 'day') &&
    currentDate.isSameOrBefore(endDate, 'day');

  const firstDay = currentDate.isSame(startDate, 'day');
  const lastDay = currentDate.isSame(endDate, 'day');

  return (
    <DateRangePickerCustomPickersDay
      {...pickersDayProps}
      disableMargin
      between={between ? 1 : 0}
      first={firstDay ? 1 : 0}
      last={lastDay ? 1 : 0}
      selected={firstDay || lastDay}
    />
  );
};

export function MyDatePicker({
  currentDate, selectedDateRange, minDate, maxDate, onChange, onMonthChange
}: MyDatePickerProps) {
  return (
    <StaticDatePicker
      displayStaticWrapperAs="desktop"
      openTo={"day"}
      views={["day"]}
      value={currentDate}
      onChange={(newValue) => newValue && onChange(newValue)}
      onMonthChange={(value) => onMonthChange(value)}
      renderInput={() => <></>}
      minDate={minDate}
      maxDate={maxDate}
    />
  )
}
