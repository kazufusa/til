library(ggplot2)
library(dplyr)
library(tidyr)
library(ggrepel)
library(stringr)
library(boot)

ff <- "HiraKakuProN-W3"
theme_update(
  title        = element_text(size=18, family=ff),
  text         = element_text(size=11, family=ff),
  axis.text.x  = element_text(size=14, family=ff),
  axis.text.y  = element_text(size=14, family=ff),
  axis.title.x = element_text(size=18, family=ff),
  axis.title.y = element_text(size=18, family=ff),
  legend.title = element_text(size=14, family=ff),
  legend.text  = element_text(size=14, family=ff),
  strip.text   = element_text(size=11, family=ff)
)

params <- read.csv("./a_s.2017.07.30.csv",check.names=F)

cat("# ロジットモデルの1次の係数aについて\n\n")
# # ロジットモデルの1次の係数aについて
#
#         今回  Elo rating
#  0.006706937 0.005756463
# logit(p) = a * delta_R
# Elo rating
# dr / 400 = log10(EEE) = log(EEE)/log(10)
# dr / 400 * log(10) = log(EEE)
a <- params['a', 'mean']
my_rating <- function(d){inv.logit(a*d)}
elo_rating <- function(d){1/(1+10^(-d/400))}

print(data.frame("今回"=c(a), "Elo rating"= log(10) / 400, check.names=F), row.names=F)

kishi <- read.csv("../20170426_pro_shogi_bayes/shogi_play_data/kishi.dates.csv")
kishi <- kishi %>%
  mutate(born_nendo=(function(y, m){
    y + sapply(m, function(x){ifelse(x >= 4, 0, -1)})
  })(born_year, born_month)) %>%
  mutate(debut_nendo=(function(y, m){
    y + sapply(m, function(x){ifelse(x >= 4, 0, -1)})
  })(debut_year, debut_month))
kishi_levels <- (kishi %>% arrange(id))$name

skill <- read.csv("./skill.2017.07.30.csv", header=T, check.names=F)
skill$name <- factor(skill$name, levels=kishi_levels)
years <- sort(unique(skill$year))

skill_peaks <- skill %>%
  group_by(year) %>%
  mutate(standing=row_number(desc(mean))) %>%
  data.frame %>%
  group_by(id, name) %>%
  filter(mean==max(mean), !year %in% c(min(years),min(years)+1, max(years)-1, max(years))) %>%
  data.frame() %>%
  select(id, name, year, mean, standing) %>%
  left_join(kishi %>% select(id, born_nendo), by=c("id"="id"), remove=T) %>%
  mutate(age=year-born_nendo+1)

standing_peaks <- skill %>%
  group_by(year) %>%
  mutate(standing=row_number(desc(mean))) %>%
  data.frame %>%
  group_by(id, name) %>%
  filter(standing==min(standing), !year %in% c(min(years),min(years)+1, max(years)-1, max(years))) %>%
  data.frame() %>%
  select(id, name, year, mean, standing) %>%
  left_join(kishi %>% select(id, born_nendo), by=c("id"="id"), remove=T) %>%
  mutate(age=year-born_nendo+1)

rating <- data.frame(read.csv("./rating.2017.07.30.csv", header=T, as.is=T))
skill2017 <- skill %>% filter(year==2017) %>%
  mutate(name=str_replace(name, " ", ""))

skill.dens <- skill %>% filter(year %in% seq(1945, 2020, 5))

skill_rating <- do.call(rbind, lapply(1:nrow(rating), function(x){
  data.frame(rating[x, ], skill2017[skill2017$name == rating[x, 'name'],])
})) %>% select(No, name, rating, mean, X2.5., X97.5.)

top10 <- skill %>%
  group_by(year) %>%
  mutate(standing=row_number(desc(mean))) %>%
  data.frame %>%
  select(id, name, year, standing, mean) %>%
  filter(standing <= 10) %>%
  arrange(year, standing)
top10$name <- factor(top10$name, levels=kishi_levels)

top10in <- top10 %>%
  group_by(name) %>%
  do(head(., n=1)) %>%
  data.frame %>%
  arrange(year, standing)
top10in$name <- factor(top10in$name, levels=kishi_levels)

top10last <- top10 %>%
  group_by(name) %>%
  do(tail(., n=1)) %>%
  data.frame %>%
  arrange(year, standing) %>%
  filter(year != max(years))
top10last$name <- factor(top10last$name, levels=kishi_levels)

top10debuts <- top10 %>%
  group_by(id, name) %>%
  do(head(., n=1)) %>%
  data.frame() %>%
  left_join(kishi, by=c("id"="id")) %>%
  select(id, year, name=name.x, debut_nendo, mean) %>%
  filter(year<=debut_nendo) %>%
  na.omit()

amahiko <- read.csv("./amahiko.skill.2017.07.30.csv", header=T, check.names=F)

cat("\nskill値の平均と中央値の差の統計量\n\n")
# skill値の平均と中央値の差の統計量
#
#  diff_mean_median 
#  Min.   :-3.3827  
#  1st Qu.:-0.6683  
#  Median :-0.2222  
#  Mean   :-0.2694  
#  3rd Qu.: 0.1720  
#  Max.   : 1.7336  
median_mean <- skill %>%
  mutate(diff_mean_median=(mean-.[["50%"]])) %>%
  select(diff_mean_median)
summary(median_mean)

png(filename="rating_function.png", width=600, height=400)
ggplot(data.frame(x=0), aes(x=x)) +
  stat_function(fun=my_rating,aes(colour="今回"), size=1) +
  stat_function(fun=elo_rating,aes(colour="Elo rating"), size=1) +
  xlab("レート差") +
  ylab("勝率") +
  scale_x_continuous(limits=c(-500,500), breaks=seq(-500,500,100)) +
  scale_y_continuous(limits=c(0, 1), breaks=seq(0,1,0.1)) +
  scale_colour_discrete(name="レーティングモデル")
null <- dev.off()

png(filename="skill_density.png", width=600, height=400)
ggplot(skill.dens, aes(x=year, y=mean, group=year)) +
  geom_violin() +
  stat_summary(fun.y=mean, aes(colour="平均値"), geom="point") +
  stat_summary(fun.y=median, aes(colour="中央値"), geom="point") +
  scale_colour_discrete(name="") +
  ylab("skill値の平均") +
  xlab("西暦年度") +
  theme(legend.title=element_text(colour="black",size=16)) +
  theme(legend.text=element_text(colour="black",size=16)) +
  scale_x_continuous(limits=c(1962.5,2017.5), breaks=seq(1965,2015,5)) +
  scale_y_continuous(limits=c(-400,400), breaks=seq(-400,400,100)) +
  theme(axis.text.x = element_text(angle = 45, hjust = 1))
null <- dev.off()

png(filename="all_skill.png", width=7000, height=5000)
ggplot(skill, aes(x=year, y=mean, group=name, colour=name)) +
  geom_point() +
  geom_line(alpha=0.3) +
  geom_text(aes(label=name), size=5, family=ff) +
  guides(colour=guide_legend(ncol=2)) +
  ylab("skill値の平均") +
  xlab("西暦年度") +
  scale_x_continuous(limits=c(min(years),max(years)), breaks=years) +
  scale_y_continuous(limits=c(-400,400), breaks=seq(-400,400,50))
null <- dev.off()

png(filename="rating-skill.png", height=1000, width=3000)
ggplot(skill_rating, aes(x=rating, y=mean, label=name, colour=name)) +
  geom_point(size=3) +
  geom_errorbar(aes(ymin=X2.5., ymax=X97.5.), size=1.5, alpha=0.7) +
  geom_label_repel(fontface="bold", max.iter=1e5, family=ff) +
  theme(legend.position="none") +
  scale_x_continuous(limits=c(1250,1900), breaks=seq(1250,1900,50)) +
  scale_y_continuous(limits=c(-350,450), breaks=seq(-350,450,50)) +
  ylab("skill値の平均と95%区間") +
  xlab("レーティング(http://kishi.a.la9.jp/ranking2.html, 2017年7月30日時点)")
null <- dev.off()
# 上振れする棋士はいても下振れする棋士はいない
# 新人が極端に勝ちまくることで上振れする
# 新人が極端に負けまくれば下振れするだろうが、極端に負けまくることはそもそもできない

png(filename="top10.png", width=2000, height=1000)
ggplot(top10, aes(x=year, y=mean, colour=name, label=name)) +
  geom_point(data=top10debuts, aes(x=year, y=mean, shape="公式戦デビュー時\nランクイン"), size=5, colour="black") +
  geom_label_repel(data=top10last, fontface="bold", show.legend=F, nudge_y=-25, size=3.5, family=ff, colour="black") +
  geom_line(size=1.5) +
  geom_point(size=2) +
  geom_label_repel(data=top10in, fontface="bold", show.legend=F, nudge_y=15, size=5, family=ff) +
  scale_x_continuous(limits=c(min(years),max(years)), breaks=seq(1950, 2020, 5)) +
  scale_y_continuous(limits=c(0,400), breaks=seq(-350,450,50)) +
  ylab("skill値の平均") +
  xlab("西暦年度") +
  guides(colour=guide_legend(ncol=1)) +
  scale_colour_discrete(name="") +
  scale_shape_discrete(name="") +
  theme(legend.title=element_text(colour="black",size=16)) +
  theme(legend.text=element_text(colour="black",size=16))
null <- dev.off()
# 米長、西村,豊島もデビュー間もなくトップ10に上がった模様
# 山田道美、村山聖はtop10のまま夭折

png(filename="sato_amahiko.png", width=600, height=400)
ggplot(amahiko, aes(x=year, y=skill, colour=as.factor(chain), group=year)) +
  geom_violin(data=subset(amahiko, chain==1), fill=NA, size=1.25) +
  geom_violin(data=subset(amahiko, chain==2), fill=NA, size=1) +
  geom_violin(data=subset(amahiko, chain==3), fill=NA, size=0.75) +
  geom_violin(data=subset(amahiko, chain==4), fill=NA, size=0.5) +
  scale_x_continuous(limits=c(2005.5,2017.5), breaks=seq(2006, 2017, 1)) +
  scale_y_continuous(limits=c(0,520), breaks=seq(0,500,100)) +
  ylab("skill値") +
  xlab("西暦年度") +
  scale_colour_discrete(name="chain") +
  theme(legend.title=element_text(colour="black",size=16)) +
  theme(legend.text=element_text(colour="black",size=16)) +
  theme(axis.text.x = element_text(angle = 45, hjust = 1))
null <- dev.off()

png(filename="skill_peak_age.png", width=600, height=400)
ggplot(skill_peaks, aes(x=age)) +
  geom_histogram(aes(fill="全体"), binwidth=1) +
  geom_histogram(data=(skill_peaks %>% filter(standing <= 20)), aes(fill="全盛期がtop20"), binwidth=1) +
  ylab("頻度") +
  xlab("skill値全盛期の年齢(数え年度)") +
  scale_fill_discrete(name="") +
  scale_x_continuous(limits=c(13,60), breaks=seq(15, 60, 5))
null <- dev.off()

png(filename="standing_peak_age.png", width=600, height=400)
ggplot(standing_peaks, aes(x=age)) +
  geom_histogram(aes(fill="全体"), binwidth=1) +
  geom_histogram(data=(standing_peaks %>% filter(standing <= 20)), aes(fill="全盛期がtop20"), binwidth=1) +
  ylab("頻度") +
  xlab("skill値順位全盛期の年齢(数え年度)") +
  scale_fill_discrete(name="") +
  scale_x_continuous(limits=c(13,60), breaks=seq(15, 60, 5))
null <- dev.off()
# standing_peaks %>% filter(id==1175)
# 羽生は15歳から46歳まで1位を32年間維持
