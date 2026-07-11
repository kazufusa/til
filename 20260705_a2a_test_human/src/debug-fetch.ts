// A2A クライアントに差し込む fetch ラッパー。
// リクエスト/レスポンスの HTTP 詳細(メソッド、URL、ヘッダ、ボディ、所要時間)を stderr に出す。

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

function prettyBody(body: string, contentType: string | null): string {
  if (contentType?.includes("json")) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      // fall through
    }
  }
  return body;
}

function indent(s: string): string {
  return s
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

export function createDebugFetch(enabled: () => boolean): typeof fetch {
  let seq = 0;

  const debugFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    if (!enabled()) return fetch(input, init);

    const id = ++seq;
    const req =
      input instanceof Request
        ? input
        : new Request(typeof input === "string" ? input : input.href, init);
    const reqBody = init?.body ? String(init.body) : "";

    console.error(cyan(`\n--- HTTP #${id} request -------------------------`));
    console.error(`${req.method} ${req.url}`);
    for (const [k, v] of req.headers) console.error(dim(`${k}: ${v}`));
    if (reqBody) {
      console.error(
        indent(prettyBody(reqBody, req.headers.get("content-type"))),
      );
    }

    const start = performance.now();
    const res = await fetch(input, init);
    const elapsed = (performance.now() - start).toFixed(0);

    console.error(
      yellow(`--- HTTP #${id} response (${elapsed}ms) --------------`),
    );
    console.error(`${res.status} ${res.statusText}`);
    for (const [k, v] of res.headers) console.error(dim(`${k}: ${v}`));

    const contentType = res.headers.get("content-type");
    if (contentType?.includes("text/event-stream")) {
      // SSE はボディを消費すると本体が読めなくなるため、ストリームを tee して逐次表示する
      const [forLog, forClient] = res.body!.tee();
      (async () => {
        const decoder = new TextDecoder();
        const reader = forLog.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          console.error(dim(indent(decoder.decode(value).trimEnd())));
        }
        console.error(cyan(`--- HTTP #${id} stream end ----------------------`));
      })();
      return new Response(forClient, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    }

    const clone = res.clone();
    const body = await clone.text();
    if (body) console.error(indent(prettyBody(body, contentType)));
    console.error(cyan(`--- HTTP #${id} end -----------------------------`));
    return res;
  };

  return debugFetch as typeof fetch;
}
