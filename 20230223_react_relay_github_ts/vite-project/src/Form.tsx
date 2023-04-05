import { styled } from "@mui/material";

function Form({ className }: { className?: string }) {
  return (
    <div className={className}>
      <h2>Form</h2>
    </div>
  );
}

export const StyledForm = styled(Form)``;
