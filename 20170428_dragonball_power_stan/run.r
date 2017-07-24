options(width=200)
set.seed(1)
library(rstan)
rstan_options(auto_write = TRUE)
options(mc.cores = parallel::detectCores())

d <- read.delim("game.txt", as.is=T, sep="\t")

N_member <-  5
N_game <- nrow(d)

data <- list(
  N_member           = N_member,
  N_game             = N_game,
  Winner             = d$winner,
  Loser              = d$loser
)

init <- function(...) {
  list(
    winner_p = rep(1, N_game),
    loser_p  = rep(0, N_game),
    power    = rep(0, N_member)
  )
}

model <- "
data {
  int N_member;
  int N_game;
  int Winner[N_game];
  int Loser[N_game];
}
parameters {
  real winner_p[N_game];
  real loser_p[N_game];
  real power[N_member];
}
model {
  for (game in 1:N_game) {
    target += normal_lpdf(winner_p[game] | power[Winner[game]], 1);
    target += normal_lpdf(loser_p[game] | power[Loser[game]], 1);
    target += bernoulli_lpmf(1 | step(winner_p[game] - loser_p[game]));
  }
  for (member in 1:N_member)
    target += normal_lpdf(power[member] | 0, 100);
}
"

chains=4
fit <- stan(model_code = model,
            data       = data,
            init       = lapply(1:chains, init),
            pars       = c('power'),
            iter       = 22000,
            warmup     = 2000,
            thin       = 10,
            chains     = chains
            )

print(summary(fit)$summary)
save(fit, file="result.rda")

# library(ggmcmc)
# ggmcmc(ggs(fit), plot=c("histogram", "density", "traceplot", "running", "compare_partial", "autocorrelation", "Rhat", "geweke"))
