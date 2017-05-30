options(width=200)
set.seed(1)

N      <- 100
a_true <- 0.4
mean1  <- 0
mean2  <- 3
sd1    <- 1
sd2    <- 1
Y      <- c(rnorm((1-a_true)*N, mean1, sd1), rnorm(a_true*N, mean2, sd2))
data   <- list(N=N, Y=Y)

write.table(Y, file="points.csv", sep=",", row.names=F, col.names=F)

iter   <- 11000
warmup <- 1000
seed   <- 123

model2a <- "
data {
  int<lower=1> N;
  vector[N] Y;
}

parameters {
  real mu;
  real<lower=0> s;
}

model {
  Y ~ normal(mu, s);
}

generated quantities {
  vector[N] log_likelihood;
  real y_pred;
  for(n in 1:N)
    log_likelihood[n] = normal_lpdf(Y[n] | mu, s);
  y_pred = normal_rng(mu, s);
}
"

model2b <- "
data {
  int<lower=1> N;
  vector[N] Y;
}

parameters {
  real mu;
  real<lower=0> s;
}

model {
  for(n in 1:N)
    target += 1/log(N) * normal_lpdf(Y[n] | mu, s);
}

generated quantities {
  vector[N] log_likelihood;
  for(n in 1:N)
    log_likelihood[n] = normal_lpdf(Y[n] | mu, s);
}
"

sink(file="/dev/null")
suppressMessages({
  library(rstan)
  fit2a <- stan(model_code=model2a, data=data, iter=iter, warmup=warmup, seed=seed, cores=4)
  fit2b <- stan(model_code=model2b, data=data, iter=iter, warmup=warmup, seed=seed, cores=4)
})
sink()
cat("model 2a\n")
print(summary(fit2a)$summary[c("mu", "s"), ])
cat("\nmodel 2b\n")
print(summary(fit2b)$summary[c("mu", "s"), ])

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

ret <- matrix(0, 1, 2)
colnames(ret) <- c('WAIC', 'WBIC')
rownames(ret) <- c('model2')

ret[1,1] <- waic(extract(fit2a)$log_likelihood)
ret[1,2] <- wbic(extract(fit2b)$log_likelihood)
cat("\n")
ret
