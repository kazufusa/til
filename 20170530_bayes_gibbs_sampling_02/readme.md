# Gibbs sampling for Bayesian estimation in Python, 01, single normal distribution

## data

100 points generated from a mixture distribution of two normal, `../20170529_stan_waic_wbic`.

params | normal1 | normal2
-|-
mean | 0 | 3
sd   | 1 | 1

mixture ratio: 0.4

## model(model 2, single normal distribution)

```
Y ~ normal(mu, s)
mu ~ uniform(-100, 100) # omitted with rstan
s ~ uniform(0, 100) # omitted with rstan
```

model | WAIC |  WBIC
-|-
model2 | 1.980418 | 201.2776

