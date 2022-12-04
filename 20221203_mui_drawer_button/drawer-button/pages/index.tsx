import { useState } from "react";
import { IconButtonProps, Box, Typography, Stack, Drawer, IconButton as MuiIconButton } from '@mui/material';
import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled';
import { styled } from '@mui/material/styles';

const drawerWidth = 240;
const drawerButtonSize = 48;
const closedDrawerWidth = 24;
const cutOutSize = 30;

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
  marginLeft: closedDrawerWidth,
  ...(open && {
    transition: theme.transitions.create('margin', {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen,
    }),
    marginLeft: `${drawerWidth}px`,
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
            width: `${drawerWidth}px`,
            height: "0px",
            backgroundColor: "red",
            borderWidth: "10px",
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              backgroundColor: "transparent",
              width: `${drawerWidth}px`,
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
            backgroundImage: `radial-gradient(circle ${cutOutSize}px at left center, transparent ${cutOutSize}px, rgba(100,255,255,0.4) 0)`,
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
            color="error"
            sx={{
              position: "absolute",
              top: `calc(50vh - ${drawerButtonSize / 2}px)`,
              padding: 0,
              marginLeft: `-${drawerButtonSize / 2}px`,
              zIndex: 1250, // upper than drawer
            }}
            open={open}
            onClick={() => setOpen(!open)}
          >
            <PlayCircleFilledIcon
              sx={{ fontSize: drawerButtonSize }}
            />
          </IconButton>
        </Main>
      </Box>
    </div >
  )
}
