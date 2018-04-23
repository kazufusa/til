# API Mock Server

## How to use

```
$ rake -T
rake setupCA  # create demoCA and register client(testuser)
rake start    # start api mock server
rake test     # access to mock server(http/https)
```

http URI is `http://localhost:8080`, and https URI is `https://localhost:8443`.

## distribute your own json via api mock

```
$ echo '{"hello": "world"}' > server/document_root/test.json
$ rake test TEST_TARGET=test.json
    python scripts/access-test.py
----------------------------------
TARGET:      http://localhost:8080/test.json
STATUS_CODE: 200
TEXT:        {"hello": "world"}

----------------------------------
Enter PEM pass phrase:
/home/XXX/.anyenv/envs/pyenv/versions/3.6.0/lib/python3.6/site-packages/urllib3/connectionpool.py:858:InsecureRequestWarning: Unverified HTTPS request is being made. Adding certificate verification is strongly advised. See: https://urllib3.readthedocs.io/en/latest/advanced-usage.html#ssl-warnings
  InsecureRequestWarning)
TARGET:      https://localhost:8443/test.json
STATUS_CODE: 200
TEXT:        {"hello": "world"}
```

## Sample code to access mock server via ssl

`scripts/access-test.py`

## Tips

### The difference of string_mask will cause error

```
+ openssl ca -config ./scripts/openssl.cnf -keyfile ./demoCA/private/cakey.pem -cert ./demoCA/cacert.pem -in ./demoCA/repository/testuser/testuser-client.csr -out ./demoCA/repository/testuser/testuser-client.pem
Using configuration from ./scripts/openssl.cnf
Enter pass phrase for ./demoCA/private/cakey.pem:
Check that the request matches the signature
Signature ok
The stateOrProvinceName field needed to be the same in the
CA certificate (Tokyo) and the request (Tokyo)
rake aborted!
```

You should change string_mask  in local openssl.cnf to `utf8only`.
