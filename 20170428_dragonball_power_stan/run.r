library(rstan)

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
    winner_performance = rep(1, N_game),
    loser_performance  = rep(0, N_game),
    power              = rep(0, N_member)
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
  real winner_performance[N_game];
  real loser_performance[N_game];
  real power[N_member];
}

transformed parameters {
}

model {
  for (game in 1:N_game) {
    winner_performance[game] ~ normal(power[Winner[game]], 1);
    loser_performance[game] ~ normal(power[Loser[game]], 1);
    if (loser_performance[game] > winner_performance[game])
      target += negative_infinity();
  }

  for (member in 1:N_member)
    power[member] ~ normal(0, 100);
}
"

chains <- 3

fit <- stan(model_code = model,
            data       = data,
            init       = lapply(1:chains, init),
            iter       = 202000,
            warmup     = 2000,
            thin       = 100,
            chains     = chains,
            cores      = chains
            )

print(fit)
save(fit, file="result.rda")

library(ggmcmc)
ggmcmc(ggs(fit), plot=c("histogram", "density", "traceplot", "running", "compare_partial", "autocorrelation", "Rhat", "geweke"))
