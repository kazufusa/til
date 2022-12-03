import { useState } from "react";
import { IconButtonProps, Box, Typography, Stack, Drawer, IconButton as MuiIconButton } from '@mui/material';
import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled';
import { styled } from '@mui/material/styles';

const contentSx = {
  padding: 3,
  marginBottom: 3,
  borderRadius: 4,
  backdropFilter: "blur(1px)",
  height: "200px",
  background: "rgba(255,255,255,0.8)"
}

const Main = styled('main', { shouldForwardProp: (prop) => prop !== 'open' })<{
  open?: boolean;
}>(({ theme, open }) => ({
  flexGrow: 1,
  transition: theme.transitions.create('margin', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  marginLeft: 24,
  ...(open && {
    transition: theme.transitions.create('margin', {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen,
    }),
    marginLeft: "240px",
  }),
}));

const IconButton = styled(MuiIconButton, {
  shouldForwardProp: (prop) => prop !== 'open',
})<IconButtonProps & { open: boolean }>(({ theme, open }) => ({
  transition: theme.transitions.create(['margin', 'width'], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  ...(open && {
    transition: theme.transitions.create(['margin', 'width'], {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen,
    }),
    marginLeft: "-25px",
    transform: "rotate(180deg)",
  }),
}));

export default function Home() {
  const [open, setOpen] = useState<boolean>(true);
  return (
    <div>
      <Box sx={{ display: "table", width: "100%" }}>
        <Drawer
          sx={{
            width: "240px",
            height: "0px",
            backgroundColor: "red",
            borderWidth: "10px",
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              backgroundColor: "transparent",
              width: "240px",
              boxSizing: 'border-box',
              padding: 1,
              paddingLeft: 5,
              border: "none",
            },
          }}
          variant="persistent"
          anchor="left"
          open={open}
        >
          <Typography> Hello App </Typography>
          <Stack spacing={2.5}>
            <Typography> Menu 1 </Typography>
            <Typography> Menu 2 </Typography>
            <Typography> Menu 3 </Typography>
            <Typography> Menu 4 </Typography>
            <Typography> Menu 5 </Typography>
            <Typography> Menu 6 </Typography>
          </Stack>
        </Drawer>
        <Main open={open}>
          <Box sx={{
            paddingLeft: 6,
            borderRadius: "32px 0px 0px 32px",
            backgroundImage: "radial-gradient(circle 30px at 0px 53%, transparent 30px, rgba(100,255,255,0.4) 0)",
          }}>
            <Box sx={{ display: "flex", paddingBottom: 2, justifyContent: "flex-end" }}>
              <Typography sx={{ paddingRight: 4 }}> Item 1 </Typography>
              <Typography sx={{ paddingRight: 4 }}> Item 2 </Typography>
              <Typography sx={{ paddingRight: 4 }}> Item 3 </Typography>
            </Box>
            <Box sx={{ overflow: "auto", height: "calc((100vh - 40px))" }}>
              <Typography sx={contentSx}> content 1 </Typography>
              <Typography sx={contentSx}> content 2 </Typography>
              <Typography sx={contentSx}> content 3 </Typography>
            </Box>
          </Box>
          <IconButton
            onClick={() => setOpen(!open)}
            color="primary"
            sx={{
              position: "absolute",
              top: "calc(50% - 8px)",
              marginLeft: "-25px",
            }}
            open={open}
          >
            <PlayCircleFilledIcon
              sx={{ fontSize: 40 }}
            />
          </IconButton>
        </Main>
      </Box>
    </div >
  )
}
