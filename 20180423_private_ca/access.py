#!/usr/bin/env python
from requests import Session

def http():
    url = 'http://localhost:8080'
    s = Session()
    r = s.get(url)
    print(url)
    print(r.status_code)
    print(r.text)

def https():
    url = 'https://localhost:8443'
    s = Session()
    s.cert = './CA/private/cakey.pem'
    r = s.get(url)
    print(url)
    print(r.status_code)
    print(r.text)

if __name__ == "__main__":
    http()
    https()
