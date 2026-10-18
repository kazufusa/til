#!/usr/bin/env python3
"""eks-exp 用の最小 Slack アプリ。標準ライブラリだけで動く。"""
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

GREETING = "hello from eks-exp"
SIGNING_SECRET = os.environ.get("SLACK_SIGNING_SECRET", "")
BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN", "")
MAX_BODY = 1024 * 1024
MAX_AGE_SEC = 300
NEWS_URL = "https://www.nhk.or.jp/rss/news/cat0.xml"


def log(msg):
    print(msg, flush=True)


def verify_signature(headers, body):
    ts = headers.get("X-Slack-Request-Timestamp", "")
    sig = headers.get("X-Slack-Signature", "")
    try:
        if abs(time.time() - int(ts)) > MAX_AGE_SEC:
            return False
    except ValueError:
        return False
    base = b"v0:" + ts.encode() + b":" + body
    expected = "v0=" + hmac.new(SIGNING_SECRET.encode(), base, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


def post_message(channel, thread_ts):
    payload = json.dumps({"channel": channel, "thread_ts": thread_ts, "text": GREETING}).encode()
    req = urllib.request.Request(
        "https://slack.com/api/chat.postMessage",
        data=payload,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": "Bearer " + BOT_TOKEN,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            ok = json.load(res).get("ok")
        log("chat.postMessage ok=%s" % ok)
    except Exception as e:  # 通信失敗は記録するだけで落とさない
        log("chat.postMessage failed: %s" % e)


def fetch_headlines():
    req = urllib.request.Request(NEWS_URL, headers={"User-Agent": "eks-exp-sample/1.0"})
    with urllib.request.urlopen(req, timeout=5) as res:
        root = ET.fromstring(res.read())
    return [t.text or "" for t in root.findall("./channel/item/title")][:5]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        log("%s %s" % (self.address_string(), fmt % args))

    def reply(self, code, body=b"", ctype="text/plain; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def news(self):
        ctype = "application/json; charset=utf-8"
        try:
            body = {
                "source": "NHK NEWS WEB (RSS)",
                "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "headlines": fetch_headlines(),
            }
            code = 200
        except Exception as e:  # 外向き通信の失敗は 502 で返す
            body = {"error": "%s: %s" % (type(e).__name__, e)}
            code = 502
        log("GET /news -> %d" % code)
        self.reply(code, json.dumps(body, ensure_ascii=False).encode(), ctype)

    def do_GET(self):
        if self.path in ("/", "/healthz"):
            self.reply(200, GREETING.encode())
        elif self.path == "/news":
            self.news()
        else:
            self.reply(404, b"not found")

    def do_POST(self):
        if self.path != "/slack/events":
            self.reply(404, b"not found")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length < 0 or length > MAX_BODY:
            self.reply(400, b"bad length")
            return
        body = self.rfile.read(length)

        if SIGNING_SECRET:
            if not verify_signature(self.headers, body):
                self.reply(401, b"invalid signature")
                return
        elif not getattr(Handler, "warned", False):
            Handler.warned = True
            log("WARNING: SLACK_SIGNING_SECRET is not set; skipping signature verification")

        try:
            data = json.loads(body or b"{}")
        except ValueError:
            self.reply(400, b"invalid json")
            return

        if data.get("type") == "url_verification":
            self.reply(200, json.dumps({"challenge": data.get("challenge")}).encode(),
                       "application/json")
            return

        self.reply(200)
        event = data.get("event") or {}
        if (data.get("type") == "event_callback" and event.get("type") == "app_mention"
                and BOT_TOKEN):
            post_message(event.get("channel"), event.get("ts"))


if __name__ == "__main__":
    log("listening on :8080")
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
