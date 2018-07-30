options(width=200, echo=F, digits=4)

suppressMessages({
    library(rstan)
})
x <- read.table("x.csv", sep=",", header=T)
data = list(
    K = 2,
    N = nrow(x),
    x = x,
    a = c(1, 1),
    mu0 = c(0, 0),
    b0 = 1,
    W0 = matrix(c(0.1, 0, 0, 0.1), nrow=2, ncol=2),
    nu0 = 1.1
)
init = function(){
    list(
      mu = matrix(c(0, 0, 0, 0), nrow=2, ncol=2)
    )
}

model = "
data {
  int<lower=2> K;
  int<lower=0> N;
  vector[2] x[N];
  vector[K] a;
  vector[2] mu0;
  real b0;
  cov_matrix[2] W0;
  real nu0;
}

transformed data {
  cov_matrix[2] W0inv;
  W0inv = inverse(W0);
}

parameters {
  simplex[K] theta;
  vector[2] mu[K];
  cov_matrix[2] Sigma[K];
}

model {
  target += dirichlet_lpdf(theta | a);

  for (k in 1:K) {
    target += inv_wishart_lpdf(Sigma[k] | nu0, W0inv);
    target += multi_normal_lpdf(mu[k] | mu0, Sigma[k] ./ b0);
  }

  for (n in 1:N) {
    real gamma[K];
    for (k in 1:K)
      gamma[k] = log(theta[k]) + multi_normal_lpdf(x[n] | mu[k], Sigma[k]);
    target += log_sum_exp(gamma);
  }
}
"

# sink(file="/dev/null")
fit <- stan(
    model_code = model,
    init       = init,
    data       = data,
    iter       = 1000,
    warmup     = 500,
    thin       = 2,
    chain      = 1,
    seed       = 1
)
sink()

write.table(rstan:::extract(fit), file="stan.csv", row.names=F, sep=",")
cat("# SUMMARY\n")
fit
cat("\n# ELAPSED TIME\n")
t(sapply(seq(1,4), function(x){attributes(fit@sim$samples[[x]])$elapsed_time}))
library(ggmcmc)
ggmcmc(ggs(fit))
