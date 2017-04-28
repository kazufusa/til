#!/bin/sh

python kishi.csv.py
python game.csv.py
head -n 1 game.csv > game.uniq.csv
tail -n +2 game.csv | sort | uniq >> game.uniq.csv
