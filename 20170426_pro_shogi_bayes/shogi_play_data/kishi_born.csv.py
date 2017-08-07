#encoding: utf8
import urllib.request
import re
from bs4 import BeautifulSoup
import re
import sys

WIKIPE_URL = "https://ja.wikipedia.org/wiki/"
WIKIPE_BORN = re.compile("生年月日\n\((\d{4})-0?(\d{1,2})-0?(\d{1,2})\)")
WIKIPE_DEBUT = re.compile("プロ入り年月日\n(\d{4})年(\d{1,2})月(\d{1,2})日")

SHOGI_URL = "https://www.shogi.or.jp/player/pro/{}.html"
SHOGI_BORN = re.compile("生年月日\n(\d{4})年(\d{1,2})月(\d{1,2})日")
SHOGI_DEBUT1 = re.compile("四段\n(\d{4})年(\d{1,2})月(\d{1,2})日")
SHOGI_DEBUT2 = re.compile("(\d{4})年(\d{1,2})月(\d{1,2})日四段")

def from_shogi_or_jp(no, name):
    """
    >>> from_shogi_or_jp("1263", "佐藤 天彦")
    (('1988', '1', '16'), ('2006', '10', '1'))
    >>> from_shogi_or_jp(263, "佐藤 天彦")
    (('1988', '1', '16'), ('2006', '10', '1'))
    >>> from_shogi_or_jp(3, "金子金五郎")
    (('1902', '1', '6'), ('1920', '1', '1'))
    """
    born = ("", "", "")
    debut = ("", "", "")

    if isinstance(no, str):
        if int(no[0:2]) >= 18:
            return born, debut
        no = int(no[1:4])

    url = SHOGI_URL.format(no)
    try:
        soup = BeautifulSoup(urllib.request.urlopen(url).read(), "html.parser")
    except urllib.error.HTTPError as e:
        return None

    if soup.find("title").text == "日本将棋連盟":
        return born, debut

    text = soup.find("table", {"class": "tableElements02"}).text

    rborn = SHOGI_BORN.search(text)
    if not rborn is None: born = rborn.group(1,2,3)

    rdebut = SHOGI_DEBUT1.search(text)
    if not rdebut is None: debut = rdebut.group(1,2,3)

    text = soup.find("div", {"id": "jsTabE04_02"}).text
    rdebut = SHOGI_DEBUT2.search(text)
    if not rdebut is None: debut = rdebut.group(1,2,3)

    return born, debut

def from_wikipedia(no, name):
    """
    >>> from_wikipedia(263, "佐藤 天彦")
    (('1988', '1', '16'), ('2006', '10', '1'))
    >>> from_wikipedia(3, "金子金五郎")
    (('', '', ''), ('', '', ''))
    >>> from_wikipedia(3, "丸山忠久")
    (('1970', '9', '5'), ('1990', '4', '1'))
    """
    nname = name.replace("髙", "高")
    nname = nname.replace("﨑", "崎")
    born = ('', '', '')
    debut = ('', '', '')

    for n in (nname, nname + "_(棋士)", nname + "_(将棋棋士)"):
        url = urllib.parse.urljoin(WIKIPE_URL, urllib.parse.quote(n.replace(" ", "")))

        try:
            soup = BeautifulSoup(urllib.request.urlopen(url).read(), "html.parser")
        except urllib.error.HTTPError as e:
            continue

        if not "将棋" in soup.find("div", {"id":"catlinks"}).text:
            continue

        infobox = soup.find("table", {"class": "infobox"})
        if infobox is None: continue

        rborn = WIKIPE_BORN.search(infobox.text)
        if rborn: born = rborn.group(1,2,3)
        rdebut = WIKIPE_DEBUT.search(infobox.text)
        if rdebut: debut = rdebut.group(1,2,3)
        break

    return born, debut

def main():
    print("id,name,born_year,born_month,born_day,debut_year,debut_month,debut_day")
    with open("kishi.csv", "r") as f:
        f.readline()
        for l in f:
            no, name = l.strip().split(",")

            sborn, sdebut = from_shogi_or_jp(no, name)
            wborn, wdebut = from_wikipedia(no, name)

            if "".join(sborn) != "" and "".join(wborn) != "":
                if (sborn != wborn):
                    print("[BORN]", no, name, sborn, wborn, file=sys.stderr)
            if "".join(sdebut) != "" and "".join(wdebut) != "":
                if (sdebut != wdebut):
                    print("[DEBUT]", no, name, sdebut, wdebut, file=sys.stderr)

            if "".join(sborn) != "":
                born = sborn
            else:
                born = wborn

            if "".join(sdebut) != "":
                debut = sdebut
            else:
                debut = wdebut

            print(",".join([no, name] + list(born) + list(debut)))

if __name__ == '__main__':
    # import doctest
    # doctest.testmod()
    main()
