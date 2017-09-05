set.seed(1)
library(dplyr)
df <- expand.grid(x=seq(0, 20, 1), y=seq(0, 20, 1)) %>%
  mutate(z=rnorm(nrow(.), 25, 5))
write.csv(df, row.names=F, file="data.csv")

library(ggplot2)

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

f=c(
  function(x){0},
  function(x){0.5},
  function(x){1},

  function(x){x},
  function(x){x^2},
  function(x){x^3},

  function(x){x^4},
  function(x){sqrt(x)},
  function(x){sqrt(sqrt(x))},

  function(x){sin(90*x)},
  function(x){cos(90*x)},
  function(x){abs(x-0.5)},

  function(x){(x*x-1)^2},
  function(x){sin(180*x)},
  function(x){abs(cos(180*x))},

  function(x){sin(360*x)},
  function(x){cos(360*x)},
  function(x){abs(sin(360*x))},

  function(x){abs(cos(360*x))},
  function(x){abs(sin(720*x))},
  function(x){abs(cos(720*x))},

  function(x){3*x},
  function(x){3*x-1},
  function(x){3*x-2},

  function(x){abs(3*x-1)},
  function(x){abs(3*x-2)},
  function(x){(3*x-1)/2},

  function(x){(3*x-2)/2},
  function(x){abs((3*x-1)/2)},
  function(x){abs((3*x-2)/2)},

  function(x){x/0.320-0.78125},
  function(x){2*x-0.84},
  # function(x){4x;1;-2x+1.84;x/0.08-11.5},
  function(x){4*x},

  function(x){abs(2*x-0.5)},
  function(x){2*x},
  function(x){2*x-0.5},

  function(x){2*x-1}
)

rgbformulae <- function(n, alpha=1, rf=7, gf=5, bf=15){
}

# set palette rgbformulae 33,13,10
# 33: |2*x - 0.5|
# 13: sin(180x)
# 10: cos(90x)

rgbformulae33 <- function(x){
  max(0, min(1, abs(2*x - 0.5)))
}
rgbformulae13 <- function(x){
  max(0, min(1, sin(pi*x)))
}
rgbformulae10 <- function(x){
  max(0, min(1, cos(0.5*pi*x)))
}

rgbformulae <- function(n){
  sapply(seq(0, 1, 1/(n-1)), function(x){
    rgb(
      rgbformulae33(x),
      rgbformulae13(x),
      rgbformulae10(x)
    )
  })
}

png(filename="geom.png")
ggplot(df, aes(x=x, y=y, fill=z)) + 
  geom_tile() +
  coord_fixed() +
  scale_fill_gradientn(colours=rgbformulae(1000), limits=c(0, 40), name="") +
  guides(fill = guide_colorbar(barheight=25), ticks=T)
null <- dev.off()
