library(rstan)
library(tidyr)
load(file="result.rda")

# data <- data %>% gather(xtype, x, -c(ncluster_mean, sd_of_residual, ncluster_sd, nvars))
# data <- data[which(data[, 'x'] != ''),]
# # p <- ggplot(data, aes(x=x, y=sd_of_residual)) +
# p <- ggplot(data, aes(x=reorder(x=x, X = sd_of_residual, FUN = min), y=sd_of_residual)) +
#   geom_violin() +
#   ggtitle('') +
#   xlab("") + ylab("") +
#   theme(title=element_text(size=18)) +
#   theme(axis.text.x=element_text(size=14)) +
#   theme(axis.text.y=element_text(size=14)) +
#   theme(axis.title.x=element_text(size=18)) +
#   theme(axis.title.y=element_text(size=18)) +
#   theme(legend.title=element_text(colour="black",size=18)) +
#   theme(legend.text=element_text(colour="black",size=18)) +
#   theme(axis.text.x = element_text(angle=90, vjust=0.5)) +
#   scale_y_continuous(limit=c(5,20),breaks=seq(0, 30, 1))
# png(filename='', width=1000, height=600)
# plot(p)
# garbage <- dev.off()
