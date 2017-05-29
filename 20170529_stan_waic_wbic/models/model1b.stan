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
    target += 1/log(N) * log_sum_exp(
      log(1-a) + normal_lpdf(Y[n] | 0, 1),
      log(a) + normal_lpdf(Y[n] | mu, 1)
    );
  }
}

generated quantities {
  vector[N] log_likelihood;
  int index;
  for(n in 1:N)
    log_likelihood[n] = log_sum_exp(
      log(1-a) + normal_lpdf(Y[n] | 0, 1),
      log(a) + normal_lpdf(Y[n] | mu, 1)
    );
}
