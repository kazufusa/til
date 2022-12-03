import { Box, Typography, Stack } from '@mui/material'

const contentSx = {
  padding: 3,
  marginBottom: 3,
  borderRadius: 4,
  backdropFilter: "blur(1px)",
  height: "200px",
  background: "rgba(255,255,255,0.6)"
}

export default function Home() {
  return (
    <div>
      <Box sx={{ display: "table", width: "100%", paddingRight: 6 }}>
        <Box sx={{ display: "table-cell", width: "20%", padding: 1, paddingLeft: 5 }}>
          <Typography> Hello App </Typography>
          <Stack spacing={2.5}>
            <Typography> Menu 1 </Typography>
            <Typography> Menu 2 </Typography>
            <Typography> Menu 3 </Typography>
            <Typography> Menu 4 </Typography>
            <Typography> Menu 5 </Typography>
            <Typography> Menu 6 </Typography>
          </Stack>
        </Box>
        <Box sx={{ display: "table-cell", paddingLeft: 6 }}>
          <Box sx={{ display: "flex", paddingBottom: 2, justifyContent: "flex-end" }}>
            <Typography sx={{ paddingRight: 4 }}> Item 1 </Typography>
            <Typography sx={{ paddingRight: 4 }}> Item 2 </Typography>
            <Typography sx={{ paddingRight: 4 }}> Item 3 </Typography>
          </Box>
          <Box sx={{ overflow: "auto", height: "calc((100vh - 40px)*0.92)" }}>
            <Typography sx={contentSx}> content 1 </Typography>
            <Typography sx={contentSx}> content 2 </Typography>
            <Typography sx={contentSx}> content 3 </Typography>
          </Box>
        </Box>
      </Box>
    </div >
  )
}
