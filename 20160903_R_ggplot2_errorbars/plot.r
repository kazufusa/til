# http://www.cookbook-r.com/Graphs/Plotting_means_and_error_bars_%28ggplot2%29/
summarySE <- function(data=NULL, measurevar, groupvars=NULL, na.rm=FALSE,
                      conf.interval=.95, .drop=TRUE) {
    library(plyr)

    # New version of length which can handle NA's: if na.rm==T, don't count them
    length2 <- function (x, na.rm=FALSE) {
        if (na.rm) sum(!is.na(x))
        else       length(x)
    }

    # This does the summary. For each group's data frame, return a vector with
    # N, mean, and sd
    datac <- ddply(data, groupvars, .drop=.drop,
      .fun = function(xx, col) {
        c(N    = length2(xx[[col]], na.rm=na.rm),
          mean = mean   (xx[[col]], na.rm=na.rm),
          sd   = sd     (xx[[col]], na.rm=na.rm)
        )
      },
      measurevar
    )

    # Rename the "mean" column    
    datac <- rename(datac, c("mean" = measurevar))

    datac$se <- datac$sd / sqrt(datac$N)  # Calculate standard error of the mean

    # Confidence interval multiplier for standard error
    # Calculate t-statistic for confidence interval: 
    # e.g., if conf.interval is .95, use .975 (above/below), and use df=N-1
    ciMult <- qt(conf.interval/2 + .5, datac$N-1)
    datac$ci <- datac$se * ciMult

    return(datac)
}

library(ggplot2)
library(gridExtra)
tg <- ToothGrowth
tgc <- summarySE(tg, measurevar="len", groupvars=c("supp","dose"))
tgc[1,2] = "point A"
tgc[2,2] = "point B"
tgc[3,2] = "point C"
tgc[4,2] = "point A"
tgc[5,2] = "point B"
tgc[6,2] = "point C"
tgc

# The errorbars overlapped, so use position_dodge to move them horizontally
pd <- position_dodge(0.1) # move them .05 to the left and right

plot <- ggplot(tgc, aes(x=dose, y=len, colour=supp)) +
  geom_errorbar(aes(ymin=len-ci, ymax=len+ci),size=1, width=0, position=pd) +
  geom_point(position=pd) +
  xlab("point")+ylab("value") +
  theme(axis.text.x=element_text(size=14, angle=-90, hjust=0.5, vjust=0.5)) +
  theme(axis.text.y=element_text(size=14)) +
  theme(axis.title.x=element_text(size=18)) +
  theme(axis.title.y=element_text(size=18)) +
  theme(legend.title=element_text(colour="black",size=18)) +
  theme(legend.text=element_text(colour="black",size=18))

png(filename="grouped-errorbar.png", width=500, height=400)
grid.arrange(plot)
dev.off()
