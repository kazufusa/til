# A Bayes Estimation of Skils of Professional Shogi Players(kishi)

## get data

1. get kishi list from http://kishi.a.la9.jp/
2. scrape html and make game data

```
$ cd ./shogi_play_data
$ python kishi.csv.py
$ python game.csv.py
$ head -n 1 game.csv > game.uniq.csv
$ tail -n +2 game.csv | sort | uniq >> game.uniq.csv
```

## make model and run MCMC sampling

## result

## references

- http://statmodeling.hatenablog.com/entry/kishi-rating
