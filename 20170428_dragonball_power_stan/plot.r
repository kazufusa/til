library(rstan)
library(dplyr)
library(tidyr)
library(ggmcmc)

load(file="result.rda")
ggmcmc(ggs(fit))

actual_data <- read.delim("actual.txt", as.is=T, sep="\t")

df <- rstan::extract(fit, pars="power")$power %>%
  data.frame %>%
  setNames(actual_data$name) %>%
  gather(name, power) %>%
  inner_join(actual_data, name="name")

range <- df %>%
  group_by(name) %>%
  summarise(actual_power=mean(actual_power),
            median=median(power),
            lower_95=sort(power)[length(power)*0.025],
            upper_95=sort(power)[length(power)*0.975])

p <- ggplot(df, aes(factor(actual_power), power)) +
  geom_violin() +
  geom_pointrange(range, mapping=aes(x=factor(actual_power), y=median, ymin=lower_95, ymax=upper_95))

png(filename='result.png', width=600, height=600)
plot(p)
garbage <- dev.off()
