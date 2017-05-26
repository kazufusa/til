library(ggmcmc)
load(file="run.rda")
ggmcmc(ggs(fit), plot=c("histogram", "density", "traceplot", "running", "compare_partial", "autocorrelation", "Rhat", "geweke"))
