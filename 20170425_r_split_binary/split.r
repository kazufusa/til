args <- commandArgs(trailingOnly=T)
input <- args[1]
output_dir <- args[2]
ss <- as.integer(args[3])

dir.create(output_dir, showWarnings=F)

s <- file.info(input)$size
bin <- readBin(input, "raw", s)

splits <- lapply(1:ceiling(s/ss), function(x){((x-1)*ss+1):min(x*ss, s)})
for (i in 1:length(splits)){
  output <- sprintf("%s/%s.%02d.bin", output_dir, input, i)
  writeBin(bin[splits[[i]]], output)
}
