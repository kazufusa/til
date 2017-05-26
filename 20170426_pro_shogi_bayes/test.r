options(width=200)
library(rstan)
library(dplyr)

game <- read.csv("./shogi_play_data/game.uniq.csv", as.is=T)
kishi <- read.csv("./shogi_play_data/kishi.csv", as.is=T)

MIN_year = 2010
MAX_year = 2016
years = MIN_year:MAX_year

target_kishi_id <- sort(
  unique(c(game[game$year %in% years, ]$winer, game[game$year %in% years, ]$loser))
)
target_kishi_id <- c(1235, 1175, 1182, 1183, 1195, 1264)

target_kishi <- kishi[kishi$id %in% target_kishi_id, ] %>%
  mutate(sid=row_number())
rownames(target_kishi) <- NULL

target_game <- game[game$winner %in% target_kishi_id & game$loser %in% target_kishi_id & game$year %in% years, ]
target_game$winner <- plyr::mapvalues(target_game$winner, from=target_kishi$id, to=target_kishi$sid)
target_game$loser <- plyr::mapvalues(target_game$loser, from=target_kishi$id, to=target_kishi$sid)
rownames(target_game) <- NULL

debut <- apply(target_kishi, 1, function(x){
  min(target_game[target_game$winner == as.integer(x['sid']) | target_game$loser == as.integer(x['sid']), ]$year)
})

retire <- apply(target_kishi, 1, function(x){
  max(target_game[target_game$winner == as.integer(x['sid']) | target_game$loser == as.integer(x['sid']), ]$year)
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
  Career  = cbind(debut, retire)-MIN_year+1
)

init <- function(...) {
  rw <- runif(N_game, -100, 100)
  list(
    winner_performance = rw,
    loser_performance  = rw-1
  )
}

model <- "
data {
  int N_kishi;
  int N_game;
  int Winner[N_game];
  int Loser[N_game];
}

parameters {
  real winner_performance[N_game];
  real loser_performance[N_game];
  real skill[N_kishi];
  real<lower=0> s[N_kishi];
}

model {
  for (g in 1:N_game) {
    target += normal_lpdf(winner_performance[g] | skill[Winner[g]], s[Winner[g]]);
    target += normal_lpdf(loser_performance[g] | skill[Loser[g]], s[Loser[g]]);
    if (loser_performance[g] > winner_performance[g])
      target += negative_infinity();
  }

  target += normal_lpdf(skill | 0, 100);
  target += cauchy_lpdf(s | 0, 10);
}
"

chains <- 3

iter <- 153000
warmup <- 3000
thin <- 100

fit <- stan(model_code = model,
            data       = data,
            init       = lapply(1:chains, init),
            iter       = iter,
            warmup     = warmup,
            thin       = thin,
            chains     = chains,
            cores      = chains,
            pars       = c('skill')
            )

save(fit, file="run.rda")

ret <- target_kishi[, c('sid', 'id', 'name')]
for (y in 1:N_year) {
  last <- sapply(target_kishi[, 'sid'], function(i){
    # summary(fit)$summary[sprintf("skill[%d,%d]", i, y), 'mean']
    summary(fit)$summary[sprintf("skill[%d]", i), 'mean']
  })
  ret <- cbind(ret, last)
  names(ret) <- c(names(ret)[1:(ncol(ret)-1)], sprintf("%d", MIN_year+y-1))
}
print(fit)
print(ret[order(ret[, toString(MAX_year)]), ])
