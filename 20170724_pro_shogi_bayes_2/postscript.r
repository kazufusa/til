options(width=200)
set.seed(1)
suppressMessages({
  library(rstan)
  rstan_options(auto_write = TRUE)
  options(mc.cores = parallel::detectCores())
  library(dplyr)
  library(tidyr)
  library(stringr)
})

game <- read.csv("../20170426_pro_shogi_bayes/shogi_play_data/game.uniq.csv", as.is=T)
kishi <- read.csv("../20170426_pro_shogi_bayes/shogi_play_data/kishi.csv", as.is=T) %>%
  arrange(id)

years = sort(unique(game$year))

target_kishi_id <- sort(
  unique(c(game[game$year %in% years, ]$winer, game[game$year %in% years, ]$loser))
)

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

load("./fit.2017.07.30.rda")
smr <- summary(fit, pars=c('skill', 'a', 's'))$summary
if (all(smr[,'Rhat'] <=1.1)) {
  cat("[!] All Rhats of skill/a/s <=1.1.\n\n")
} else {
  print(smr[smr[,'Rhat'] >= 1.1,])
}
write.table(smr[c('a', 's'),], "a_s.2017.07.30.csv", sep=",")

narows <- sapply(1:nrow(data$Career), function(i){
  debut <- data$Career[i,1]
  retire <- data$Career[i,2]
  pre_debut <- c()
  post_retire <- c()
  if (debut != 1) pre_debut <- 1:(debut-1)
  if (retire != N_year) post_retire <- (retire+1):N_year
  remove <- c(pre_debut, post_retire)
  sapply(remove, function(x){
    rowname <- sprintf("skill[%d,%d]", i, x)
  })
})
narows <- unlist(narows)
skill <- smr %>%
  data.frame(check.names=F) %>%
  tibble::rownames_to_column() %>%
  filter(grepl("skill", rowname)) %>%
  filter(!rowname %in% narows) %>%
  mutate(year=as.integer(str_match(rowname, "([0-9]+),([0-9]+)")[,3])+MIN_year-1) %>%
  mutate(kishi_id=as.integer(str_match(rowname, "([0-9]+),([0-9]+)")[,2])) %>%
  inner_join(target_kishi, by=c("kishi_id"="sid")) %>%
  select(-kishi_id, -rowname, id, name)
skill <- skill[, c(12,13,11,1:10)]
write.table(skill, "skill.2017.07.30.csv", sep=",", row.names=F)

# 佐藤天彦名人
sid <- 240
amahiko_rows <- sapply(data$Career[sid, 1]:data$Career[sid, 2], function(x){
  sprintf("skill[%d,%d]", sid, x)
})
amahiko <- rstan::extract(fit, pars=amahiko_rows, permuted=F)
amahiko <- apply(amahiko, 3, function(x){x %>% data.frame %>% gather(chain, skill)})
amahiko <- do.call(rbind, lapply(names(amahiko), function(x){
  year <- as.integer(str_match(x, "([0-9]+),([0-9]+)")[,3])+MIN_year-1
  data.frame(amahiko[[x]], year=year)
})) %>% mutate(chain=as.integer(str_match(chain, "[0-9]")[,1]))
write.table(amahiko, "amahiko.skill.2017.07.30.csv", sep=",", row.names=F)
