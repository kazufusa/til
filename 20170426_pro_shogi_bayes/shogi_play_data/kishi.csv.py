#encoding: utf8
import urllib.request
import re
from bs4 import BeautifulSoup

URL = "http://kishi.a.la9.jp/"
KISHI_ID_MATCHER = re.compile("./konki/(1\d\d\d).html")
KISHI_NAME_MATCHER = re.compile("(.*)　(.*) ")

def main():
    with open("kishi.csv", "w") as f:
        f.write("id,name\n")
        soup = BeautifulSoup(urllib.request.urlopen(URL).read().decode('cp932'), "html.parser")
        for a in soup.find_all("a"):
            mid = KISHI_ID_MATCHER.match(a.get("href"))
            if not mid: continue
            mname = KISHI_NAME_MATCHER.match(a.string)
            f.write("%s,%s %s\n"% (mid[1], mname[1], mname[2]))

if __name__ == '__main__':
    main()
