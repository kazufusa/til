"""構成B 実験: SFN Local の LAMBDA_ENDPOINT 用モック Lambda サーバ.

Lambda Invoke API (POST /2015-03-31/functions/{name}/invocations) を最小実装する.
- 関数名に "approval" を含む: waitForTaskToken パターン想定.
  payload 内の taskToken を /tmp/exp07_token.json に書き出して即 200 を返す
  (Lambda の返値は waitForTaskToken では捨てられ、実行はトークン待ちのまま).
- それ以外: payload をそのまま echo する.

port 9001 で 0.0.0.0 に bind (コンテナから 172.17.0.1:9001 で到達させる).
"""

import json
import re
from http.server import BaseHTTPRequestHandler, HTTPServer

TOKEN_FILE = "/tmp/exp07_token.json"


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _read_body(self) -> str:
        """Content-Length と Transfer-Encoding: chunked の両方に対応する."""
        te = (self.headers.get("Transfer-Encoding") or "").lower()
        if "chunked" in te:
            chunks = []
            while True:
                size_line = self.rfile.readline().strip()
                size = int(size_line.split(b";")[0], 16)
                if size == 0:
                    self.rfile.readline()  # trailing CRLF
                    break
                chunks.append(self.rfile.read(size))
                self.rfile.readline()  # chunk CRLF
            return b"".join(chunks).decode("utf-8")
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length).decode("utf-8") if length else "{}"

    def do_POST(self):  # noqa: N802
        m = re.match(r"^/2015-03-31/functions/([^/]+)/invocations", self.path)
        body = self._read_body() or "{}"
        fn = m.group(1) if m else "?"
        print(
            f"[mock-lambda] invoke fn={fn} te={self.headers.get('Transfer-Encoding')}"
            f" cl={self.headers.get('Content-Length')} payload={body[:300]}",
            flush=True,
        )
        payload = json.loads(body) if body else {}

        if "approval" in fn:
            with open(TOKEN_FILE, "w") as f:
                json.dump(payload, f, ensure_ascii=False)
            result = {"status": "token stored"}
        else:
            result = {"echo": payload}

        data = json.dumps(result).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):  # noqa: A002
        pass


if __name__ == "__main__":
    print("mock lambda listening on 0.0.0.0:9001")
    HTTPServer(("0.0.0.0", 9001), Handler).serve_forever()
