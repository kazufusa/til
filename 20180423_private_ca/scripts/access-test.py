#!/usr/bin/env python
from requests import Session
import os

CA = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'demoCA')

cert_path = os.path.join(CA, "repository/testuser/testuser-client.pem")
key_path = os.path.join(CA, "repository/testuser/testuser-client.key")

def http():
    uri = 'http://localhost:8080/' + os.environ.get('TEST_TARGET', '')
    s = Session()
    r = s.get(uri)
    print("TARGET:      {}".format(uri))
    print("STATUS_CODE: {}".format(r.status_code))
    print("TEXT:        {}".format(r.text))

def https():
    uri = 'https://localhost:8443/' + os.environ.get('TEST_TARGET', '')
    s = Session()
    s.cert = (cert_path, key_path, 'test')
    s.headers.update({'user': 'testuser'})
    r = s.get(uri, verify=False)
    print("TARGET:      {}".format(uri))
    print("STATUS_CODE: {}".format(r.status_code))
    print("TEXT:        {}".format(r.text))

if __name__ == "__main__":
    print("----------------------------------")
    http()
    print("----------------------------------")
    https()
