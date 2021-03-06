library(rstan)
library(dplyr)
library(tidyr)

load(file="result.rda")

reference_data <- read.delim("ref.txt", as.is=T, sep="\t")
reference_data$reference_power = log10(reference_data$reference_power)

df <- rstan::extract(fit, pars="power")$power %>%
  data.frame %>%
  setNames(reference_data$name) %>%
  gather(name, power) %>%
  inner_join(reference_data, name="name")
df$name = factor(df$name, levels=reference_data$name)

range <- df %>%
  group_by(name) %>%
  summarise(reference_power=mean(reference_power),
            median=median(power),
            lower_95=sort(power)[length(power)*0.025],
            upper_95=sort(power)[length(power)*0.975])

p <- ggplot(df, aes(reference_power, power, group=name, fill=name)) +
  geom_violin(size=0, adjust=1.5) +
  geom_pointrange(range, mapping=aes(x=reference_power, y=median, ymin=lower_95, ymax=upper_95, colour=name), size=1.5) +
  labs(color="name") +
  scale_fill_manual(values=rep("grey70", 5)) +
  scale_y_continuous(limits=c(-500, 500), breaks=seq(-500, 500, 250)) +
  xlab("log10(Actual Power Level)") +
  ylab("Estimated Power Level") +
  theme(plot.title=element_text(size=18)) +
  theme(axis.text.x=element_text(size=14)) +
  theme(axis.text.y=element_text(size=14)) +
  theme(axis.title.x=element_text(size=18)) +
  theme(axis.title.y=element_text(size=18)) +
  theme(legend.title=element_text(colour="black",size=18)) +
  theme(legend.text=element_text(colour="black",size=18))

png(filename='result.png', width=700, height=600)
plot(p)
garbage <- dev.off()
