import urllib
import re
from itertools import chain
from bs4 import BeautifulSoup

def get_precs():
    precs_url = "http://www.data.jma.go.jp/obd/stats/etrn/select/prefecture00.php"
    soup = BeautifulSoup(urllib.request.urlopen(precs_url).read(), "html.parser")
    precs = soup.find_all('area')
    return list(map(lambda x:[
        x.get("alt"),
        urllib.parse.parse_qs(urllib.parse.urlparse(x.get("href")).query)['prec_no'][0]
    ], precs))

def get_blocks(prec):
    blocks_url = "http://www.data.jma.go.jp/obd/stats/etrn/select/prefecture.php?prec_no={}".format(prec)
    soup = BeautifulSoup(urllib.request.urlopen(blocks_url).read(), "html.parser")
    blocks = soup.find_all('area', onmouseout="javascript:initPoint();")
    return list(map(lambda x:[
        x.get("alt"),
        urllib.parse.parse_qs(urllib.parse.urlparse(x.get("href")).query)['block_no'][0]
    ], blocks))

def get_daily_values():
    url_example = "http://www.data.jma.go.jp/obd/stats/etrn/view/daily_a1.php?prec_no=31&block_no=1027&year=2017&month=01&view=a1"
    soup = BeautifulSoup(urllib.request.urlopen(url_example).read(), "html.parser")
    rows = soup.find(id="tablefix1").find_all('tr', style="text-align:right;")
    values = list(map(lambda x:[x.text for x in x.find_all("td")][0:6], rows))
    print(values)
    return(values)

if __name__ == '__main__':
    get_daily_values()
    precs = get_precs()
    blocks = get_blocks(precs[0][1])
    print(blocks)
