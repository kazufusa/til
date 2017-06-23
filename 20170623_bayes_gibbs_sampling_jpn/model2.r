options(width=200)
Y <- read.table("points.csv")[, 1]
data   <- list(N=length(Y), Y=Y)

model2 <- "
data {
  int<lower=1> N;
  vector[N] Y;
}

parameters {
  real<lower=0, upper=1> a;
  real<lower=-50, upper=50> mu;
}

model {
  for(n in 1:N){
    target += log_sum_exp(
      log(1-a) + normal_lpdf(Y[n] | 0, 1),
      log(a) + normal_lpdf(Y[n] | mu, 1)
    );
  }
}

generated quantities {
  vector[N] log_likelihood;
  int index;
  real y_pred;
  for(n in 1:N)
    log_likelihood[n] = log_sum_exp(
      log(1-a) + normal_lpdf(Y[n] | 0, 1),
      log(a) + normal_lpdf(Y[n] | mu, 1)
    );
  index = bernoulli_rng(a);
  y_pred = normal_rng(index == 1 ? mu: 0, 1);
}
"

sink(file="/dev/null")
suppressMessages({
  library(rstan)
  fit <- stan(model_code=model2, data=data, iter=11000, warmup=1000, seed=123)
})
sink()
cat("# results of the mixture normal distribution model with Rstan\n")
print(summary(fit)$summary[c("mu", "a"), ])

waic <- function(log_likelihood) {
  training_error <- - mean(log(colMeans(exp(log_likelihood))))
  functional_variance_div_N <- mean(colMeans(log_likelihood^2) - colMeans(log_likelihood)^2)
  waic <- training_error + functional_variance_div_N
  return(waic)
}

cat(sprintf("WAIC: %f", waic(extract(fit)$log_likelihood)))
