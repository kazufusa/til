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
  int index;
  real y_pred;
  for(n in 1:N)
    log_likelihood[n] = normal_lpdf(Y[n] | mu, s);
  y_pred = normal_rng(mu, s);
}
