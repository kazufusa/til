options(width=200)
set.seed(1)
suppressMessages({
  library(rstan)
  rstan_options(auto_write = TRUE)
  options(mc.cores = parallel::detectCores())
  library(dplyr)
  library(tidyr)
})

game <- read.csv("../20170426_pro_shogi_bayes/shogi_play_data/game.uniq.csv", as.is=T)
kishi <- read.csv("../20170426_pro_shogi_bayes/shogi_play_data/kishi.csv", as.is=T) %>%
  arrange(id)
# game <- read.csv("game.uniq.csv", as.is=T)
# kishi <- read.csv("kishi.csv", as.is=T) %>%
#   arrange(id)

years = sort(unique(game$year))
# years = 2013:2017

target_kishi_id <- sort(
  unique(c(game[game$year %in% years, ]$winer, game[game$year %in% years, ]$loser))
)

# 若手
# target_kishi_id <- (kishi[order(kishi$id),] %>%
#   filter(id < 1500) %>%
#   tail(n=20))$id

# 2017年 A級以上
# target_kishi_id <- c(1235, 1263, 1175, 1207, 1182, 1183, 1195, 1201, 1208, 1255, 1189)

# 羽生世代BIG4
# target_kishi_id <- c(1175, 1182, 1183, 1195)

target_kishi <- kishi[kishi$id %in% target_kishi_id, ] %>%
  mutate(sid=row_number())

target_game <- game %>%
  filter(winner %in% target_kishi_id, loser %in% target_kishi_id, year %in% years) %>%
  inner_join(target_kishi, by=c("winner"="id")) %>%
  inner_join(target_kishi, by=c("loser"="id"))

debut <- apply(target_kishi, 1, function(x){
  sid <- as.integer(x['sid'])
  min((target_game %>% filter(sid.x==sid | sid.y==sid))$year)
})

retire <- apply(target_kishi, 1, function(x){
  sid <- as.integer(x['sid'])
  max((target_game %>% filter(sid.x==sid | sid.y==sid))$year)
})

N_kishi <- nrow(target_kishi)
N_game <- nrow(target_game)
N_year <- length(unique(target_game$year))
MIN_year <- min(target_game$year)

data <- list(
  N_kishi = N_kishi,
  N_game  = N_game,
  N_year  = N_year,
  Winner  = target_game$sid.x,
  Loser   = target_game$sid.y,
  Year    = target_game$year-MIN_year+1,
  Career  = cbind(debut, retire)-MIN_year+1
)

model <- "
data {
  int N_kishi;
  int N_game;
  int N_year;
  int Winner[N_game];
  int Loser[N_game];
  int Year[N_game];
  int Career[N_kishi, 2];
}

parameters {
  real i_skill[N_kishi];
  real r_skill[N_kishi, N_year-1];
  real<lower=0> a;
  real<lower=0> s;
}

transformed parameters {
  real skill[N_kishi, N_year];
  real log_p[N_game];

  for(k in 1:N_kishi) {
    for (y in 1:Career[k,1])
      skill[k, y] = i_skill[k];

    for(y in (Career[k,1]+1):Career[k,2])
      skill[k, y] = skill[k, y-1] + r_skill[k, y-1];

    for (y in (Career[k,2]+1):N_year)
      skill[k, y] = skill[k,Career[k,2]];
  }

  for (g in 1:N_game)
    log_p[g] = log_inv_logit(a * (skill[Winner[g], Year[g]] - skill[Loser[g], Year[g]]));
}

model {
  for (k in 1:N_kishi) {
    target += normal_lpdf(i_skill[k] | 0, 100);
    for (y in Career[k,1]:(Career[k,2]-1))
      target += normal_lpdf(r_skill[k, y] | 0, s);
  }

  target += sum(log_p);

  target += uniform_lpdf(s | 0, 100);
}
"

iter   <- 12000
warmup <- 2000
thin   <- 5
chains <- 4
fit <- stan(
  model_code = model,
  seed       = 1,
  data       = data,
  iter       = iter,
  pars       = c('skill', 'a', 's'),
  warmup     = warmup,
  thin       = thin,
  chains     = chains
)

save(fit, file="fit.2017.07.30.rda")
smr <- summary(fit, pars=c('skill', 'a', 's'))$summary
if (all(smr[,'Rhat'] <=1.1)) {
  cat("[!] All Rhats of skill/a/s <=1.1.\n\n")
} else {
  print(smr[smr[,'Rhat'] >= 1.1,])
}
