import pathlib
import numpy as np
import pandas as pd
pd.set_option('display.width', 200)
import pystan
import pickle

games = pd.read_csv('../20170426_pro_shogi_bayes/shogi_play_data/game.uniq.csv')
kishis = pd.read_csv('../20170426_pro_shogi_bayes/shogi_play_data/kishi.csv').sort_values(by="id")
years = games.year.sort_values().unique()
# years = [x for x in range(2013,2018)]

# 全棋士
target_kishi_id = pd.concat([games.winner, games.loser]).sort_values().unique()
# 若手
# target_kishi_id = pd.concat([games.winner, games.loser]).sort_values().unique()
# target_kishi_id = target_kishi_id[np.where(target_kishi_id < 1500)][-20:]
# 2017年 A級以上
# target_kishi_id = (1235, 1263, 1175, 1207, 1182, 1183, 1195, 1201, 1208, 1255, 1189)
# 羽生世代BIG4
# target_kishi_id = (1175, 1182, 1183, 1195)

target_kishis = kishis[kishis.id.isin(target_kishi_id)]
target_kishis.insert(0, 'sid', range(1, 1+len(target_kishi_id)))
target_kishis = target_kishis.reset_index(drop=True)

target_games = games[
    games.winner.isin(target_kishi_id) &
    games.loser.isin(target_kishi_id) &
    games.year.isin(years)
]
target_games = target_games.join(target_kishis.set_index("id"), on="winner")
target_games = target_games.join(target_kishis.set_index("id"), on="loser", rsuffix="_l")

debut = target_kishis.apply(lambda x:
    target_games[(target_games.sid==x.sid) | (target_games.sid_l==x.sid)].year.min()
, axis=1)

retire = target_kishis.apply(lambda x:
    target_games[(target_games.sid==x.sid) | (target_games.sid_l==x.sid)].year.max()
, axis=1)

N_kishi = target_kishis.shape[0]
N_game = target_games.shape[0]
N_year = len(target_games.year.unique())
MIN_year = target_games.year.min()

data = {
    "N_kishi": N_kishi,
    "N_game":  N_game,
    "N_year":  N_year,
    "Winner":  target_games.sid,
    "Loser":   target_games.sid_l,
    "Year":    target_games.year-MIN_year+1,
    "Career":  pd.concat([debut, retire], axis=1)-MIN_year+1
}

model_code = """
data {
  int N_kishi;
  int N_game;
  int N_year;
  int Winner[N_game];
  int Loser[N_game];
  int Year[N_game];
  int Career[N_kishi, 2];
}

parameters {
  real i_skill[N_kishi];
  real r_skill[N_kishi, N_year-1];
  real<lower=0> a;
  real<lower=0> s;
}

transformed parameters {
  real skill[N_kishi, N_year];
  real log_p[N_game];

  for(k in 1:N_kishi) {
    for (y in 1:Career[k,1])
      skill[k, y] = i_skill[k];

    for(y in (Career[k,1]+1):Career[k,2])
      skill[k, y] = skill[k, y-1] + r_skill[k, y-1];

    for (y in (Career[k,2]+1):N_year)
      skill[k, y] = skill[k,Career[k,2]];
  }

  for (g in 1:N_game)
    log_p[g] = log_inv_logit(a * (skill[Winner[g], Year[g]] - skill[Loser[g], Year[g]]));
}

model {
  for (k in 1:N_kishi) {
    target += normal_lpdf(i_skill[k] | 0, 100);
    for (y in Career[k,1]:(Career[k,2]-1))
      target += normal_lpdf(r_skill[k, y] | 0, s);
  }

  target += sum(log_p);

  target += uniform_lpdf(s | 0, 100);
}
"""

extra_compile_args = [
    "-O3",
    "-mtune=native",
    "-march=native",
    "-Wno-unused-variable",
    "-Wno-unused-function",
    "-flto",
    "-ffat-lto-objects",
    "-Wno-unused-local-typedefs"
]

def build_model(model_code):
    pkl = pathlib.Path("model.pkl")

    if pkl.exists():
        with open(pkl, 'rb') as f:
            stan_model = pickle.load(f)
            if stan_model.model_code == model_code:
                return stan_model

    stan_model = pystan.StanModel(model_code=model_code, extra_compile_args=extra_compile_args)
    with open(pkl, 'wb') as f:
        pickle.dump(stan_model, f)
    return stan_model

stan_model = build_model(model_code)

iteration = 12000
warmup = 2000
thin = 5
chains = 4

fit = stan_model.sampling(
    data   = data,
    seed   = 1,
    iter   = iteration,
    warmup = warmup,
    chains = chains,
    thin   = thin,
    n_jobs = chains
)
with open("result.pkl", 'wb') as f:
    pickle.dump(fit, f)

with open("result.pkl", 'rb') as f:
    fit = pickle.load(f)

summary = fit.summary(pars=['a', 's', 'skill'])
fitdf = pd.DataFrame(summary['summary'])
fitdf.columns=summary['summary_colnames']
fitdf.index=summary['summary_rownames']
values = summary['summary_colnames']

if all(fitdf['Rhat'] <= 1.1):
  print("\n[!] All Rhats of skill/a/s <=1.1.\n")
else:
  print(fitdf[fitdf['Rhat'] > 1.1])

def gen_select(iy, column):
    def select(x):
        is_in_career = data['Career'][0][x.sid-1] <= iy+1 & iy+1 <= data['Career'][1][x.sid-1]
        if is_in_career:
            return fitdf[column]["skill[{},{}]".format(x.sid-1,iy)] 
        else:
            return np.nan
    return select

for iy, y in enumerate(years):
    vs = pd.DataFrame(target_kishis.apply(gen_select(iy, v), axis=1).rename('{}_{}'.format(v, y)) for v in values)
    target_kishis = pd.concat([target_kishis, vs.T], axis=1)
target_kishis.to_csv('skill_pystan.csv')

# values = ['mean']
# for iy in range(N_year):
#     vs = pd.DataFrame(target_kishis.apply(gen_select(iy, v), axis=1).rename('{}_{}'.format(v, MIN_year + iy)) for v in values)
#     target_kishis = pd.concat([target_kishis, vs.T], axis=1)
# print(target_kishis.sort_values("mean_2017"))

def waic(loglik):
    training_error = - np.mean(np.log(np.mean(np.exp(loglik), axis=0)))
    functional_variance_div_N = np.mean(np.mean(np.power(loglik,2), axis=0) -
        np.power(np.mean(loglik, axis=0),2))
    return training_error + functional_variance_div_N

print("\n[!] WAIC:", waic(fit.extract(pars="log_p")["log_p"]))
