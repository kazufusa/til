set.seed(1)

library(rstan)
rstan_options(auto_write = TRUE)
options(mc.cores = parallel::detectCores())

x <- seq(0, 1000, 1)
a <- 1
b <- 100
s <- 5
y <- sapply(x, function(x){rnorm(1, a * x + b, s)})
m <- summary(lm(y ~ x))
m
m$sigma

data = list(
            N = length(x),
            x = x,
            y = y
            )

model <- "
data {
  int<lower=0> N;
  real x[N];
  real y[N];
}
parameters {
  real a;
  real b;
  real<lower=0> s;
}
transformed parameters {
  real theta[N];
  for (n in 1:N)
    theta[n] = a * x[n] + b;
}
model {
  target += normal_lpdf(y | theta, s);
}
"

fit <- stan(
            model_code=model,
            data=data,
            iter=2000,
            pars=c("a", "b", "s"),
            chain=3
            )
fit
save(fit, file="fit.rda")

library(coda)
fit.coda<-mcmc.list(lapply(1:ncol(fit),function(x) mcmc(as.array(fit)[,x,])))
plot(fit.coda)

library(ggmcmc)
ggmcmc(ggs(fit))
