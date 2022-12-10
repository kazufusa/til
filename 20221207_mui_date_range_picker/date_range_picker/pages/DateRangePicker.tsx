import React, { useMemo, useState, useRef, useEffect } from 'react';
import TextField from '@mui/material/TextField';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { PickersDay, PickersDayProps } from '@mui/x-date-pickers/PickersDay';
import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import IconButton from '@mui/material/IconButton';
import dayjs from 'dayjs';
import EventIcon from '@mui/icons-material/Event';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { Theme } from '@mui/material';
import styled from '@emotion/styled';
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

type TPickersDayProps = PickersDayProps<Date> & {
  between: number;
  first: number;
  last: number;
  theme?: Theme;
};
const MuiDatePick = styled.div(({ theme }: { theme?: Theme }) => ({
  '& .MuiPickerStaticWrapper-content': {
    transition: 'width 225ms cubic-bezier(0.4, 0, 0.6, 1) 0ms',
    borderRadius: '4px',
    boxShadow:
      '0px 5px 5px -3px rgb(0 0 0 / 20%), ' +
      '0px 8px 10px 1px rgb(0 0 0 / 14%), ' +
      '0px 3px 14px 2px rgb(0 0 0 / 12%)',
    outline: 0,
  },
  '&.Mui-selected': {
    backgroundColor: "blue", //theme?.palette.primary.main,
  },
}));

export const DateRangePickerCustomPickersDay = styled(PickersDay)(
  ({ theme, between, first, last }: TPickersDayProps) => ({
    ...(between
      ? {
        borderRadius: 0,
        background: `${theme?.palette?.primary.main ?? "blue"}`,
        color: `${theme?.palette?.common?.white ?? "white"}`,
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

export type TDateRangePickerProps = {
  startDate: Date;
  endDate: Date;
  onChange?: (startDate: Date | null, endDate: Date | null) => void;
  size?: 'small' | 'medium';
  placeholder?: string;
};

export const DateRangePicker: React.FC<TDateRangePickerProps> = ({
  onChange,
  startDate = new Date(),
  endDate = new Date(),
  size = 'medium',
  placeholder = '선택하세요',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<boolean>(false);
  const [lastSelectedDate, setLastSelectedDate] = useState<'start' | 'end'>('end');
  const [startDateState, setStartDateState] = useState<Date | null>(startDate);
  const [endDateState, setEndDateState] = useState<Date | null>(endDate);
  const [viewChangeState, setViewChangeState] = useState<boolean>(false);

  const clickModalOutside = (event) => {
    if (open && !modalRef?.current?.contains(event.target)) {
      onClose();
    }
  };

  const onClose = () => {
    if (!endDateState) setEndDateState(startDateState);

    if (onChange) onChange(startDateState, endDateState);

    setOpen(false);
  };

  useEffect(() => {
    document.addEventListener('mousedown', clickModalOutside);

    return () => {
      document.removeEventListener('mousedown', clickModalOutside);
    };
  });

  const textFieldValue = useMemo(() => {
    if (!startDateState && !endDateState) return placeholder;

    if (startDateState && !endDateState)
      return `${dayjs(startDateState).format('YYYY-MM-DD')} - ${placeholder}`;

    if (!startDateState && endDateState)
      return `${placeholder} - ${dayjs(endDateState).format('YYYY-MM-DD')}`;

    return `${dayjs(startDateState).format('YYYY-MM-DD')} - ${dayjs(endDateState).format(
      'YYYY-MM-DD',
    )}`;
  }, [endDateState, placeholder, startDateState]);

  const renderSelectedDays = (
    day: Date,
    selectedDays: Date[],
    pickersDayProps: PickersDayProps<Date>,
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

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <div
        style={{
          display: 'flex',
          width: '250px',
          flexDirection: 'column',
        }}
      >
        <TextField
          size={size}
          value={textFieldValue}
          InputProps={{
            endAdornment: EventIcon ? (
              <IconButton
                sx={{
                  '&:hover': {
                    backgroundColor: 'lightgray',
                    borderRadius: '50%',
                  },
                }}
                onClick={() => setOpen(true)}
              >
                <EventIcon />
              </IconButton>
            ) : null,
          }}
        ></TextField>
        {open ? (
          <MuiDatePick ref={modalRef}>
            <StaticDatePicker
              renderDay={renderSelectedDays}
              minDate={
                viewChangeState || endDateState ? undefined : startDateState || undefined
              }
              displayStaticWrapperAs="desktop"
              views={["day"]}
              showDaysOutsideCurrentMonth={true}
              value={endDateState || startDateState}
              onViewChange={(currentView) => {
                if (currentView === 'day') {
                  setViewChangeState(true);
                }

                if (lastSelectedDate === 'start') {
                  setEndDateState(null);
                  setLastSelectedDate('start');
                } else if (lastSelectedDate === 'end') {
                  setLastSelectedDate('end');
                  setStartDateState(null);
                }
              }}
              onChange={(newDate) => {
                setViewChangeState(true);
                const newDateValue = newDate ? new Date(newDate) : null;

                if (!lastSelectedDate || lastSelectedDate === 'end') {
                  setEndDateState(null);
                  setStartDateState(newDateValue);
                  setLastSelectedDate('start');
                  setViewChangeState(false);
                } else {
                  setEndDateState(newDateValue);
                  setLastSelectedDate('end');
                }
              }}
              renderInput={(params) => <TextField {...params} />}
            />
          </MuiDatePick>
        ) : null}
      </div>
    </LocalizationProvider>
  );
};
