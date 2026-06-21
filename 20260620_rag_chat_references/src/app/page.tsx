"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Reference = {
  id: number;
  source_id: number;
  filename: string;
  title: string;
  heading_path: string[];
  heading_text: string | null;
  block_type: string;
  char_start: number;
  char_end: number;
  snippet: string;
};
type SkillRef = { id: number; name: string; rel_path: string };
type Block = { text?: string; citations?: number[] };
type Msg = {
  role: "user" | "assistant";
  text?: string;
  blocks?: Block[];
  refs?: Reference[];
  skills?: SkillRef[];
  error?: string;
};

type Preview =
  | {
      kind: "source";
      id: number;
      charStart?: number;
      charEnd?: number;
      label: string;
    }
  | { kind: "skill"; id: number; label: string };

function refLabel(r: Reference): string {
  let head = r.heading_path.length
    ? r.heading_path[r.heading_path.length - 1]
    : r.block_type;
  if (head.length > 40) head = head.slice(0, 40) + "…";
  return `${r.filename} › ${head}`;
}

export default function Page() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skills, setSkills] = useState<SkillRef[]>([]);
  // 直近の検索セッションID(「もっと深掘り」で渡して追加検索する)
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    fetch("/api/skills")
      .then((r) => r.json())
      .then((d) => setSkills(d.skills ?? []))
      .catch(() => {});
  }, []);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setLoading(true);
    setMessages((m) => [
      ...m,
      { role: "user", text: q },
      { role: "assistant", blocks: [], refs: [], skills: [] },
    ]);

    const patchLast = (patch: Partial<Msg>) =>
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { ...next[next.length - 1], ...patch };
        return next;
      });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, sessionId }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        patchLast({ error: err.error ?? "request failed" });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "lookup") {
            patchLast({ refs: ev.chunks, skills: ev.skills });
            if (ev.sessionId) setSessionId(ev.sessionId);
          } else if (ev.type === "answer") {
            patchLast({ blocks: ev.value?.blocks ?? [] });
          } else if (ev.type === "error") {
            patchLast({ error: ev.error });
          }
        }
      }
    } catch (e) {
      patchLast({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, [input, loading, sessionId]);

  return (
    <div className="app">
      <div className="col chat">
        <div className="header">
          RAG Chat <span className="sub">エージェンティック検索 + ブロック単位の出典</span>
        </div>
        <div className="scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="empty">
              markdown 知識ベースに質問してください。
              <br />
              例: 「Go の web フレームワークを比較して」「pgvector とは？要するに何ができる？」
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div className="msg" key={i}>
                <div className="role">you</div>
                <div className="bubble user">{m.text}</div>
              </div>
            ) : (
              <AssistantMsg key={i} m={m} onOpen={setPreview} />
            ),
          )}
          {loading && <div className="empty">検索 / 生成中…</div>}
        </div>
        <div className="composer">
          <textarea
            value={input}
            placeholder="質問を入力 (Enter で送信 / Shift+Enter で改行)"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button onClick={() => void send()} disabled={loading || !input.trim()}>
            送信
          </button>
        </div>
      </div>

      <div className="col">
        <FilesPanel
          onOpen={setPreview}
          activeId={preview?.kind === "source" ? preview.id : null}
          skills={skills}
        />
        <PreviewPanel preview={preview} />
      </div>
    </div>
  );
}

type SourceInfo = {
  id: number;
  filename: string;
  title: string;
  chunk_count: number;
};

function FilesPanel({
  onOpen,
  activeId,
  skills,
}: {
  onOpen: (p: Preview) => void;
  activeId: number | null;
  skills: SkillRef[];
}) {
  const [files, setFiles] = useState<SourceInfo[]>([]);
  const [open, setOpen] = useState(false);
  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((d) => setFiles(d.sources ?? []))
      .catch(() => {});
  }, []);
  // 参照クリックで対象ファイルが選択されたら該当行へスクロール(開いている時だけ。
  // 自動で開くと右カラムの高さが変わりプレビューがガタつくため開かない)
  useEffect(() => {
    if (activeId != null && open) {
      const t = setTimeout(
        () => activeRef.current?.scrollIntoView({ block: "nearest" }),
        60,
      );
      return () => clearTimeout(t);
    }
  }, [activeId, open]);
  return (
    <details
      className="files"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        ファイル一覧 ({files.length} + skill {skills.length})
      </summary>
      <div className="files-list">
        {skills.map((s) => (
          <div
            className="file-item"
            key={`skill-${s.id}`}
            title={s.rel_path}
            onClick={() => onOpen({ kind: "skill", id: s.id, label: s.name })}
          >
            <span className="file-name">
              <span className="badge skill">skill</span> {s.name}
            </span>
            <span className="file-meta">md</span>
          </div>
        ))}
        {files.map((f) => (
          <div
            className={`file-item${f.id === activeId ? " active" : ""}`}
            key={f.id}
            ref={f.id === activeId ? activeRef : undefined}
            title={f.title}
            onClick={() =>
              onOpen({ kind: "source", id: f.id, label: f.filename })
            }
          >
            <span className="file-name">{f.filename}</span>
            <span className="file-meta">{f.chunk_count}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function AssistantMsg({
  m,
  onOpen,
}: {
  m: Msg;
  onOpen: (p: Preview) => void;
}) {
  const refById = new Map((m.refs ?? []).map((r) => [r.id, r]));
  // 出典は「回答が実際に引用したチャンク」だけを導出(検索で拾っただけのものは出さない)
  const citedRefs: Reference[] = [];
  const seenCited = new Set<number>();
  for (const b of m.blocks ?? [])
    for (const cid of b.citations ?? [])
      if (!seenCited.has(cid) && refById.has(cid)) {
        seenCited.add(cid);
        citedRefs.push(refById.get(cid)!);
      }
  // 本文中の引用は小さな通し番号で示す
  const numById = new Map(citedRefs.map((r, i) => [r.id, i + 1]));
  return (
    <div className="msg">
      <div className="role">assistant</div>
      <div className="bubble">
        {m.error && <div style={{ color: "#ff8585" }}>エラー: {m.error}</div>}
        {(m.blocks ?? []).map((b, bi) => (
          <div className="block" key={bi}>
            <div className="block-md">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {b.text ?? ""}
              </ReactMarkdown>
            </div>
            {!!b.citations?.length && (
              <sup className="cite-marks">
                {b.citations.map((cid) => {
                  const r = refById.get(cid);
                  const n = numById.get(cid);
                  if (!r || !n) return null;
                  return (
                    <span
                      className="cite-mark"
                      key={cid}
                      data-label={refLabel(r)}
                      onClick={() =>
                        onOpen({
                          kind: "source",
                          id: r.source_id,
                          charStart: r.char_start,
                          charEnd: r.char_end,
                          label: refLabel(r),
                        })
                      }
                    >
                      {n}
                    </span>
                  );
                })}
              </sup>
            )}
          </div>
        ))}

        {(!!citedRefs.length || !!m.skills?.length) && (
          <div className="refs">
            {!!m.skills?.length && (
              <>
                <h4>実行されたスキル</h4>
                {m.skills.map((s) => (
                  <div
                    className="ref-item"
                    key={`sk-${s.id}`}
                    onClick={() =>
                      onOpen({ kind: "skill", id: s.id, label: s.name })
                    }
                  >
                    <span className="badge skill">skill</span>
                    <span>{s.name}</span>
                    <span className="ref-snip">{s.rel_path}</span>
                  </div>
                ))}
              </>
            )}
            <h4>出典 ({citedRefs.length})</h4>
            {citedRefs.map((r, i) => (
              <div
                className="ref-item"
                key={r.id}
                onClick={() =>
                  onOpen({
                    kind: "source",
                    id: r.source_id,
                    charStart: r.char_start,
                    charEnd: r.char_end,
                    label: refLabel(r),
                  })
                }
              >
                <span className="ref-id">{i + 1}</span>
                <span>{refLabel(r)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// raw 表示で該当箇所の前後に出す文字数(全文を描画すると巨大 DOM で重い/ガタつくため窓表示)
const RAW_PAD = 1200;

function PreviewPanel({ preview }: { preview: Preview | null }) {
  const [content, setContent] = useState<string>("");
  const [meta, setMeta] = useState<{ title: string; path: string } | null>(null);
  const [tab, setTab] = useState<"raw" | "rendered">("raw");
  const cacheRef = useRef<
    Map<string, { content: string; meta: { title: string; path: string } }>
  >(new Map());
  const markRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!preview) return;
    setTab("raw");
    const key = `${preview.kind}:${preview.id}`;
    const cached = cacheRef.current.get(key);
    if (cached) {
      // キャッシュ済みは即時表示(空にしないのでガタつかない)
      setContent(cached.content);
      setMeta(cached.meta);
      return;
    }
    let cancelled = false;
    const url =
      preview.kind === "source"
        ? `/api/sources/${preview.id}`
        : `/api/skills/${preview.id}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) {
          setContent(`(取得失敗: ${d.error})`);
          return;
        }
        const m =
          preview.kind === "source"
            ? { title: d.title ?? d.filename, path: d.filename }
            : { title: d.name, path: d.rel_path };
        cacheRef.current.set(key, { content: d.content ?? "", meta: m });
        setContent(d.content ?? "");
        setMeta(m);
      })
      .catch((e) => {
        if (!cancelled) setContent(`(取得失敗: ${String(e)})`);
      });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  // 窓表示なので大きなスクロールは不要。mark を軽く可視位置へ。
  useEffect(() => {
    if (tab !== "raw") return;
    const t = setTimeout(
      () => markRef.current?.scrollIntoView({ block: "center" }),
      30,
    );
    return () => clearTimeout(t);
  }, [content, tab, preview]);

  if (!preview) {
    return (
      <>
        <div className="header">ソースプレビュー</div>
        <div className="empty">
          出典チップ / 一覧をクリックすると、ここに該当箇所を表示します。
        </div>
      </>
    );
  }

  const cs = preview.kind === "source" ? (preview.charStart ?? -1) : -1;
  const ce = preview.kind === "source" ? (preview.charEnd ?? -1) : -1;
  const hasRange = cs >= 0 && ce > cs && ce <= content.length;
  const from = hasRange ? Math.max(0, cs - RAW_PAD) : 0;
  const to = hasRange ? Math.min(content.length, ce + RAW_PAD) : content.length;

  return (
    <>
      <div className="header preview-head">
        {preview.kind === "skill" && <span className="badge skill">skill</span>}
        <span>{meta?.title ?? preview.label}</span>
        <span className="path">{meta?.path}</span>
        <div className="tabs">
          <span
            className={`tab ${tab === "raw" ? "active" : ""}`}
            onClick={() => setTab("raw")}
          >
            raw (該当箇所)
          </span>
          <span
            className={`tab ${tab === "rendered" ? "active" : ""}`}
            onClick={() => setTab("rendered")}
          >
            rendered
          </span>
        </div>
      </div>
      <div className="preview-body">
        {tab === "rendered" ? (
          <div className="block-md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : hasRange ? (
          <div className="raw">
            {from > 0 && <span className="raw-ellipsis">… </span>}
            {content.slice(from, cs)}
            <mark ref={markRef}>{content.slice(cs, ce)}</mark>
            {content.slice(ce, to)}
            {to < content.length && <span className="raw-ellipsis"> …</span>}
          </div>
        ) : (
          <div className="raw">{content}</div>
        )}
      </div>
    </>
  );
}
