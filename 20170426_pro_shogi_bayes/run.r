options(width=200)
library(rstan)
library(dplyr)

game <- read.csv("./shogi_play_data/game.uniq.csv", as.is=T)
kishi <- read.csv("./shogi_play_data/kishi.csv", as.is=T)

target_kishi_id <- sort(unique(c(game[game$year>=2000, ]$winer, game[game$year>=2000, ]$loser)))
target_kishi <- kishi[kishi$id %in% target_kishi_id, ] %>%
  mutate(sid=row_number())
rownames(target_kishi) <- NULL

target_game <- game[game$winner %in% target_kishi_id & game$loser %in% target_kishi_id, ]
target_game$winner <- plyr::mapvalues(target_game$winner, from=target_kishi$id, to=target_kishi$sid)
target_game$loser <- plyr::mapvalues(target_game$loser, from=target_kishi$id, to=target_kishi$sid)
rownames(target_game) <- NULL

debut <- apply(target_kishi, 1, function(x){
  min(target_game[target_game$winner == as.integer(x['sid']) | target_game$loser == as.integer(x['sid']), ]$year)
})

N_kishi <- nrow(target_kishi)
N_game <- nrow(target_game)
N_year <- length(unique(target_game$year))
MIN_year <- min(target_game$year)

data <- list(
  N_kishi = N_kishi,
  N_game  = N_game,
  N_year  = N_year,
  Winner  = target_game$winner,
  Loser   = target_game$loser,
  Year    = target_game$year-MIN_year+1,
  Debut   = debut-MIN_year+1
)


init <- function(...) {
  list(
    winner_performance = rep(1, N_game),
    loser_performance  = rep(0, N_game)
  )
}

model <- "
data {
  int N_kishi;
  int N_game;
  int N_year;
  int Winner[N_game];
  int Loser[N_game];
  int Year[N_game];
  int Debut[N_kishi];
}

parameters {
  real winner_performance[N_game];
  real loser_performance[N_game];
  real r_skill[N_kishi, N_year-1];
  real initial_skill[N_kishi];
  real beta[N_kishi];
  real<lower=0> s_k[N_kishi];
  real mu_s_k;
  real<lower=0> s[3];
}

transformed parameters {
  real skill[N_kishi, N_year];

  for(y in 1:N_year) {
    for(k in 1:N_kishi) {
      if (y <= Debut[k]) {
        skill[k, y] = initial_skill[k];
      } else {
        skill[k, y] = skill[k, y-1] + beta[k] + r_skill[k, y-1];
      }
    }
  }
}

model {
  for (g in 1:N_game) {
    winner_performance[g] ~ normal(skill[Winner[g], Year[g]], s_k[Winner[g]]);
    loser_performance[g] ~ normal(skill[Loser[g], Year[g]], s_k[Loser[g]]);
    if (loser_performance[g] > winner_performance[g])
      target += negative_infinity();
  }

  for (k in 1:N_kishi){
    initial_skill[k] ~ normal(0, 100);
    beta[k] ~ normal(0, s[1]);

    for (y in 1:(N_year-1))
      r_skill[k,y] ~ normal(0, s[2]);

    s_k[k] ~ lognormal(mu_s_k, s[3]);
  }
  mu_s_k ~ normal(0, 100);
  s ~ uniform(0, 100);
}
"

chains <- 3

fit <- stan(model_code = model,
            data       = data,
            init       = lapply(1:chains, init),
            iter       = 153000,
            warmup     = 3000,
            thin       = 100,
            chains     = chains,
            cores      = chains,
            pars       = c('skill', 's_k')
            )

print(fit)
save(fit, file="run.rda")
