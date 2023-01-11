import { GridFilterPanel } from "@mui/x-data-grid";
import { styled, Theme, ThemeProvider } from "@mui/material";
import React from "react";
import appTheme from "./AppTheme";

const theme = {
  ...appTheme,
  ...{ components: { MuiAutocomplete: undefined } },
};

export const MyGridFilterPanel = styled(
  ({ className }: { className?: string }) => (
    <ThemeProvider theme={theme}>
      <div className={className}>
        <GridFilterPanel
          filterFormProps={{
            linkOperatorInputProps: {
              variant: "outlined",
              size: "small",
            },
            columnInputProps: {
              variant: "outlined",
              size: "small",
            },
            operatorInputProps: {
              variant: "outlined",
              size: "small",
            },
            valueInputProps: {
              InputComponentProps: {
                label: "",
                variant: "outlined",
                size: "small",
              },
            },
            deleteIconProps: {},
          }}
        />
      </div>
    </ThemeProvider>
  )
)`
margin-top: 8px;
background-color: white;
border-radius: 5px;
border: 1px solid;
& .MuiDataGrid-filterForm {
    padding-left: 8px!important;
    display: flex;
    flex-wrap: wrap;
    width: 500px;

    &:nth-of-type(odd) {
      /* background-color: ${(theme: Theme) =>
        theme?.palette?.mode === "dark" ? "#444" : "#f5f5f5"}; */
    }

    & .MuiDataGrid-filterFormDeleteIcon {
        & .MuiSvgIcon-root {
          color: #d32f2f;
        },
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        width: 60px;
        &::after {
          content: "列";
          display: inline-block;
          margin-right: 10px;
        }
    }
    & .MuiDataGrid-filterFormColumnInput {
      width: 213px;
      margin-right: 8px;
    }
    & .MuiDataGrid-filterFormOperatorInput {
      width: 213px;
    }
    & .MuiDataGrid-filterFormValueInput {
      margin-top: 10px;
      margin-left: 64px;
      width: 100%;
      & .MuiOutlinedInput-root {
        border: 1px solid;
      }
      & .MuiFormLabel-root {
        display: none;
      }
      &::after {
        position: absolute;
        height: 100%;
        width: 64px;
        text-align: center;
        margin-left: -56px;
        line-height: 45px;
        content: "値";
        display: inline-block;
      }
    }
}
` as React.ElementType;
