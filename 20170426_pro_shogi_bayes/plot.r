options(width=200, digits=2)
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

load(file="run.rda")

ret <- target_kishi[, c('sid', 'id', 'name')]
s <- summary(fit)$summary
for (y in 1:N_year) {
  last <- sapply(target_kishi[, 'sid'], function(i){
    s[sprintf("skill[%d,%d]", i, y), 'mean']
  })
  ret <- cbind(ret, last)
  names(ret) <- c(names(ret)[1:(ncol(ret)-1)], sprintf("%d", MIN_year+y-1))
}

ret[order(ret$sid), ]

# library(ggmcmc)
# ggmcmc(ggs(fit), plot=c("histogram"))
# ggmcmc(ggs(fit), plot=c("histogram", "density", "traceplot", "running", "compare_partial", "autocorrelation", "Rhat", "geweke"))
