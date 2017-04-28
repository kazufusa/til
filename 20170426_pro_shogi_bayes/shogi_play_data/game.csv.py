#encoding: utf8
import urllib.request
import re
from itertools import chain
from bs4 import BeautifulSoup

KISHI_URL = "http://kishi.a.la9.jp/{year}/{id}.html"
KONKI_URL = "http://kishi.a.la9.jp/konki/{id}.html"
YEAR_MATCHER = re.compile("\d{4}")

def kishi_years(id):
    """
    >>> kishi_years(1244)
    ['2015', '2014', '2013', '2012', '2011', '2010', '2009', '2008', '2007', '2006', '2005', '2004', '2003', '2002']
    """
    soup = BeautifulSoup(
            urllib.request.urlopen(KONKI_URL.format(id=id)).read().decode('cp932'),
            "html.parser"
            )
    return list(filter(lambda x: YEAR_MATCHER.match(x), map(lambda x:x.string, soup.find_all("a"))))

def kishi_games_in_year(id, year):
    """
    >>> kishi_games_in_year(1244, 2015)
    ['2015,05,07,1293,1244,1293,1244,第28期竜王戦 ６組 昇級者決定戦 3回戦']
    """
    soup = BeautifulSoup(
            urllib.request.urlopen(KISHI_URL.format(year=year, id=id)).read().decode('cp932'),
            "html.parser"
            )
    return(list(set(filter(lambda x: x, map(lambda x:parse_game(id, year, x), soup.find_all("tr"))))))

def kishi_games(id):
    """
    >>> # kishi_games(1244)
    """
    for year in kishi_years(id):
        kishi_games_in_year(id, year)
    return(list(chain(*[kishi_games_in_year(id, year) for year in kishi_years(id)])))

# year, month, day, first, second, winner, loser
def parse_game(id, year, game):
    if len(game.find_all("td")) < 2 or not game.find_all("td")[2].string in ["○", "●"]:
        return ""

    if not game.find("a"):
        return ""

    opponent_id = game.find("a").get("href")[2:6]
    if opponent_id[0] != '1':
        return ""

    if(game.find_all("td")[1].string):
        date = re.match("(\d*)月(\d*)日", game.find_all("td")[1].string)
        date = '{year},{month:02d},{day:02d}'.format(
                year=year, month=(int(date[1])-4)%12+4, day=int(date[2])
                )
    else:
        date = "{},,".format(year)

    if game.find_all("td")[2].string == "○":
        winner_loser = "{},{}".format(id, opponent_id)
    elif game.find_all("td")[2].string == "●":
        winner_loser = "{},{}".format(opponent_id, id)
    else:
        return ""

    if game.find_all("td")[3].string == "先":
        players = "{},{}".format(id, opponent_id)
    elif game.find_all("td")[3].string == "後":
        players = "{},{}".format(opponent_id, id)
    else:
        players = ","

    tournament = game.find_all("td")[5].text.strip()

    return("{},{},{},{}".format(date, players, winner_loser, tournament))

def main(kishi_list):
    with open("game.csv", "w") as f:
        f.write("year,month,day,first,second,winner,loser,tournament\n")
        for kishi in kishi_list:
            print(kishi)
            for game in kishi_games(kishi):
                f.write(game + "\n")

if __name__ == '__main__':
    # import doctest
    # doctest.testmod()
    # main([1064, 1309, 1310])
    with open("kishi.csv") as f:
        kishi_list = list(map(lambda x:x.split(",")[0], f.readlines()[1:]))
    main(kishi_list)
