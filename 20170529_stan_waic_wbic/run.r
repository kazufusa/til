library(rstan)
set.seed(1)

N      <- 100
a_true <- 0.4
mean1  <- 0
mean2  <- 3
sd1    <- 1
sd2    <- 1
Y      <- c(rnorm((1-a_true)*N, mean1, sd1), rnorm(a_true*N, mean2, sd2))
data   <- list(N=N, Y=Y)

# hist(Y)
# plot(density(Y))

iter   <- 11000
warmup <- 1000
seed   <- 123

tryCatch(
  {
    load(file="fits/fit1a.rda")
    load(file="fits/fit1b.rda")
    load(file="fits/fit2a.rda")
    load(file="fits/fit2b.rda")
  },
  error=function(...){
    fit1a <- stan(file="models/model1a.stan", data=data, iter=iter, warmup=warmup, seed=seed, cores=4)
    save(fit1a, file="fits/fit1a.rda")
    fit1b <- stan(file="models/model1b.stan", data=data, iter=iter, warmup=warmup, seed=seed, cores=4)
    save(fit1b, file="fits/fit1b.rda")
    fit2a <- stan(file="models/model2a.stan", data=data, iter=iter, warmup=warmup, seed=seed, cores=4)
    save(fit2a, file="fits/fit2a.rda")
    fit2b <- stan(file="models/model2b.stan", data=data, iter=iter, warmup=warmup, seed=seed, cores=4)
    save(fit2b, file="fits/fit2b.rda")
  }
)

load(file="fits/fit1a.rda")
load(file="fits/fit1b.rda")
load(file="fits/fit2a.rda")
load(file="fits/fit2b.rda")
ms1a <- extract(fit1a)
ms1b <- extract(fit1b)
ms2a <- extract(fit2a)
ms2b <- extract(fit2b)

generalization_error <- function(ms) {
  dens <- density(ms$y_pred)
  f_pred <- approxfun(dens$x, dens$y, yleft=1e-18, yright=1e-18)
  f_true <- function(x) (1-a_true)*dnorm(x, mean1, sd1) + a_true*dnorm(x, mean2, sd2)
  f_ge <- function(x) f_true(x)*(-log(f_pred(x)))
  # f_en <- function(x) f_true(x)*(-log(f_true(x)))
  # entropy <- integrate(f_en, lower=-6, upper=9)$value
  ge <- integrate(f_ge, lower=-6, upper=9)$value
  return(ge)
}

waic <- function(log_likelihood) {
  training_error <- - mean(log(colMeans(exp(log_likelihood))))
  functional_variance_div_N <- mean(colMeans(log_likelihood^2) - colMeans(log_likelihood)^2)
  waic <- training_error + functional_variance_div_N
  return(waic)
}

wbic <- function(log_likelihood){
  wbic <- - mean(rowSums(log_likelihood))
  return(wbic)
}

ret <- matrix(0, 2, 3)
colnames(ret) <- c('汎化誤差', 'WAIC', 'WBIC')
rownames(ret) <- c('モデル1', 'モデル2')

ret[1,1] <- generalization_error(ms1a)
ret[1,2] <- waic(ms1a$log_likelihood)
ret[1,3] <- wbic(ms1b$log_likelihood)
ret[2,1] <- generalization_error(ms2a)
ret[2,2] <- waic(ms2a$log_likelihood)
ret[2,3] <- wbic(ms2b$log_likelihood)
ret
