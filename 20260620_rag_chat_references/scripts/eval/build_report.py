#!/usr/bin/env python3
# head-to-head 比較レポート生成: batch(回答全文) + verdict(ソース照合スコア) を結合し、
# 比較JSON と 自己完結HTMLレポート を出力する。モデル複数対応(3.1 / 2.5 をマージ)。
#
#   python3 scripts/eval/build_report.py
#
# 入力: scratch/h2h/{batch-*.json, verdict-*.json}  (3.1)
#       <model-tag> ごとに verdict-<tag>-*.json があれば追加モデルとして取り込む
# 出力: scripts/eval/results/h2h-comparison.json, scripts/eval/results/h2h-report.html

import json, glob, os, sys, html, datetime
from collections import defaultdict, Counter

SCRATCH = "/tmp/claude-1000/-home-kazufusa-src-github-com-kazufusa-til-20260620-rag-chat-references/290e4946-cb1b-440a-850c-7fee1f530ea6/scratchpad/h2h"
OUT = "scripts/eval/results"
MODES = ["vector", "keyword", "hybrid"]

# Vertex 単価(per 1M tokens, 2026-06 時点)。embed は gemini-embedding-2 = $0.20。
RATES = {
    "gemini-3.1-flash-lite": {"in": 0.25, "out": 1.50, "emb": 0.20},
    "gemini-2.5-flash-lite": {"in": 0.10, "out": 0.40, "emb": 0.20},
}

def cost_of(t, rate):
    return (t.get("llmIn", 0) * rate["in"] + t.get("llmOut", 0) * rate["out"]
            + t.get("embedTokens", 0) * rate["emb"]) / 1e6

# h2h 回答ファイル(meta.tokens を持つ)からモデルのトークン消費を集計。
# g25 = gemini-2.5-flash-lite, それ以外 = gemini-3.1-flash-lite。JP+EN を合算。
def load_tokens(model_id):
    is25 = "2.5" in model_id
    pats = ["h2h-g25-queries_*json-*.json"] if is25 else ["h2h-queries_*json-*.json"]
    files = []
    for p in pats:
        files += [f for f in glob.glob(os.path.join(OUT, p)) if ("g25" in os.path.basename(f)) == is25]
    # gold セットごとに最新を1つずつ
    latest = {}
    for f in files:
        key = "en" if "_en_" in f else "jp"
        if key not in latest or os.path.getmtime(f) > os.path.getmtime(latest[key]):
            latest[key] = f
    rate = RATES.get(model_id, RATES["gemini-3.1-flash-lite"])
    byMode = {m: {"llmIn": 0, "llmOut": 0, "embedTokens": 0} for m in MODES}
    total = {"llmIn": 0, "llmOut": 0, "embedTokens": 0}
    requests = 0
    for f in latest.values():
        tk = json.load(open(f)).get("tokens", {})
        requests += tk.get("requests", 0)
        for m in MODES:
            bm = tk.get("byMode", {}).get(m, {})
            for k in ("llmIn", "llmOut", "embedTokens"):
                byMode[m][k] += bm.get(k, 0); total[k] += bm.get(k, 0)
    for m in MODES:
        byMode[m]["cost"] = cost_of(byMode[m], rate)
    total["cost"] = cost_of(total, rate)
    answers = requests * len(MODES)
    return {"byMode": byMode, "total": total, "requests": requests,
            "perRequestCost": (total["cost"] / requests) if requests else 0,
            "perAnswerCost": (total["cost"] / answers) if answers else 0,
            "rate": rate}

# モデル定義: tag -> (label, verdict glob, 回答の出所(batch は 3.1 答えなので 3.1 のみ batch 由来))
# 3.1 の回答は batch-*.json に入っている。2.5 は別 batch を作る場合 batch-g25-*.json を見る。
def load_model(label, verdict_glob, batch_glob):
    """verdict と batch を i で結合して質問ごとの {scores,best,reason,answers} を返す。
    返り値: dict[question] = {set,domain,type,file,methods:{m:{answer,score}},best,reason,note}"""
    out = {}
    for vf in sorted(glob.glob(os.path.join(SCRATCH, verdict_glob))):
        bid = os.path.basename(vf).split("verdict-")[1].split(".json")[0]
        # batch ファイルを探す(モデルタグを除いたバッチID)
        plain_bid = bid.replace("g25-", "")
        bf = os.path.join(SCRATCH, f"batch-{plain_bid}.json")
        if not os.path.exists(bf):
            bf2 = glob.glob(os.path.join(SCRATCH, batch_glob.replace("BID", plain_bid)))
            bf = bf2[0] if bf2 else bf
        try:
            verds = json.load(open(vf))
            cases = json.load(open(bf))["cases"]
        except Exception as e:
            print("skip", vf, e); continue
        if not isinstance(verds, list):
            verds = verds.get("verdicts") or verds.get("results") or []
        byi = {v.get("i"): v for v in verds}
        for i, c in enumerate(cases):
            v = byi.get(i)
            if not v: continue
            s = v.get("scores", {})
            out[c["question"]] = {
                "set": bid.split("-")[0].replace("g25", "").strip("-") or ("EN" if "EN" in bid else "JP"),
                "domain": c["domain"], "type": c["type"], "file": os.path.basename(c["targetMd"]),
                "methods": {m: {"answer": c["answers"].get(m, ""), "score": s.get(m)} for m in MODES},
                "best": v.get("best"), "reason": v.get("reason", ""), "note": v.get("note", ""),
            }
    return out

# --- モデル登録(現時点で存在するものだけ) ---
MODELS = []  # (modelId, dict[question]->record)
m31 = load_model("gemini-3.1-flash-lite", "verdict-[JE]*[0-9].json", "batch-BID.json")
if m31: MODELS.append(("gemini-3.1-flash-lite", m31))
m25 = load_model("gemini-2.5-flash-lite", "verdict-g25-*.json", "batch-g25-BID.json")
if m25: MODELS.append(("gemini-2.5-flash-lite", m25))

if not MODELS:
    print("no data found"); sys.exit(1)

# 全質問の和集合(順序は最初のモデル基準)
all_questions = []
seen = set()
for _, d in MODELS:
    for q in d:
        if q not in seen: seen.add(q); all_questions.append(q)

# --- 比較JSON: 質問ごとに各モデルの3手法回答+スコア ---
comparison = []
for q in all_questions:
    rec = {"question": q, "models": {}}
    meta_set = None
    for mid, d in MODELS:
        if q in d:
            r = d[q]; meta_set = meta_set or r
            rec["models"][mid] = {"methods": r["methods"], "best": r["best"], "reason": r["reason"], "note": r["note"]}
    if meta_set:
        rec.update({"set": meta_set["set"], "domain": meta_set["domain"], "type": meta_set["type"], "file": meta_set["file"]})
    comparison.append(rec)
os.makedirs(OUT, exist_ok=True)
json.dump({"models": [m for m, _ in MODELS], "n": len(comparison), "cases": comparison},
          open(os.path.join(OUT, "h2h-comparison.json"), "w"), ensure_ascii=False, indent=1)

# --- 集計 ---
def summarize(d, subset=None):
    rows = [r for q, r in d.items() if subset is None or r["set"] == subset]
    n = len(rows)
    res = {"n": n}
    for m in MODES:
        xs = [r["methods"][m]["score"] for r in rows if isinstance(r["methods"][m]["score"], int)]
        res[m] = {
            "mean": round(sum(xs)/len(xs), 3) if xs else 0,
            "p2": round(sum(1 for x in xs if x == 2)/len(xs)*100, 1) if xs else 0,
            "p0": round(sum(1 for x in xs if x == 0)/len(xs)*100, 1) if xs else 0,
        }
    best = Counter(r["best"] for r in rows)
    res["best"] = {m: best.get(m, 0) for m in MODES + ["tie"]}
    return res

summaries = {}
for mid, d in MODELS:
    summaries[mid] = {"ALL": summarize(d), "JP": summarize(d, "JP"), "EN": summarize(d, "EN")}

# --- HTML 生成 ---
def esc(s): return html.escape(str(s)) if s is not None else ""

rows_js = []
for q in all_questions:
    base = next((d[q] for _, d in MODELS if q in d), None)
    if not base: continue
    entry = {"q": q, "set": base["set"], "domain": base["domain"], "type": base["type"], "file": base["file"], "m": {}}
    for mid, d in MODELS:
        if q in d:
            r = d[q]
            entry["m"][mid] = {
                "best": r["best"], "reason": r["reason"], "note": r["note"],
                **{md: {"a": r["methods"][md]["answer"], "s": r["methods"][md]["score"]} for md in MODES},
            }
    rows_js.append(entry)

tokens_by_model = {mid: load_tokens(mid) for mid, _ in MODELS}

DATA = {"models": [m for m, _ in MODELS], "summaries": summaries, "rows": rows_js,
        "tokens": tokens_by_model,
        "generated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), "modes": MODES}

html_doc = """<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>検索手法 head-to-head 比較レポート</title>
<style>
:root{--v:#2563eb;--k:#d97706;--h:#059669;--bg:#f8fafc;--card:#fff;--bd:#e2e8f0;--mut:#64748b}
*{box-sizing:border-box}body{font-family:system-ui,"Hiragino Kaku Gothic ProN",Meiryo,sans-serif;margin:0;background:var(--bg);color:#0f172a;line-height:1.6}
header{background:#0f172a;color:#fff;padding:20px 24px}h1{margin:0 0 4px;font-size:20px}.sub{color:#94a3b8;font-size:13px}
main{max-width:1280px;margin:0 auto;padding:20px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:16px;margin-bottom:16px}
h2{font-size:16px;margin:0 0 12px;border-left:4px solid #0f172a;padding-left:8px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid var(--bd);padding:6px 10px;text-align:right}th:first-child,td:first-child{text-align:left}
th{background:#f1f5f9}.best{font-weight:700}
.v{color:var(--v)}.k{color:var(--k)}.h{color:var(--h)}
.controls{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.controls input,.controls select{padding:6px 10px;border:1px solid var(--bd);border-radius:6px;font-size:13px}
.q{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:14px;margin-bottom:12px}
.qhead{font-weight:600;margin-bottom:4px}.qmeta{font-size:12px;color:var(--mut);margin-bottom:10px}
.tag{display:inline-block;background:#f1f5f9;border-radius:4px;padding:1px 7px;margin-right:6px;font-size:11px}
.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.col{border:1px solid var(--bd);border-radius:8px;padding:10px;background:#fcfdff}
.col h4{margin:0 0 6px;font-size:13px;display:flex;justify-content:space-between;align-items:center}
.ans{font-size:12.5px;white-space:pre-wrap;color:#1e293b;max-height:240px;overflow:auto}
.badge{font-size:11px;font-weight:700;border-radius:10px;padding:1px 8px;color:#fff}
.s2{background:#059669}.s1{background:#d97706}.s0{background:#dc2626}.sx{background:#94a3b8}
.star{color:#eab308}
.reason{font-size:12px;color:var(--mut);margin-top:8px;border-top:1px dashed var(--bd);padding-top:6px}
.modelblock{margin-top:10px}.modelname{font-size:12px;font-weight:700;color:#334155;margin:6px 0}
.winner-v{box-shadow:0 0 0 2px var(--v) inset}.winner-k{box-shadow:0 0 0 2px var(--k) inset}.winner-h{box-shadow:0 0 0 2px var(--h) inset}
.muted{color:var(--mut);font-size:12px}
</style></head><body>
<header><h1>検索手法 head-to-head 比較レポート</h1>
<div class="sub">vector / keyword(=similar) / hybrid を実ソース照合で採点(模範解答=gold は不使用)。<span id="genmeta"></span></div></header>
<main>
<div class="card"><h2>サマリ(平均スコア 0-2 / 完全正答=2率 / 致命的失敗=0率 / 単独勝ち)</h2><div id="summary"></div>
<p class="muted">優劣評価 = 実ソース文書だけを正解基準にした head-to-head 採点(0=誤り/放棄, 1=部分, 2=正確網羅)。模範解答(gold)は不使用。</p></div>
<div class="card"><h2>トークン消費・金額換算(JP+EN 合算 / 手法別)</h2><div id="cost"></div></div>
<div class="card"><h2>質問別 比較</h2>
<div class="controls">
<input id="search" placeholder="質問・ファイルで検索…" size="28">
<select id="setf"><option value="">全セット</option><option>JP</option><option>EN</option></select>
<select id="typef"><option value="">全type</option></select>
<label class="muted"><input type="checkbox" id="divonly"> 手法差があるものだけ</label>
<span class="muted" id="count"></span>
</div>
<div id="list"></div>
</div>
</main>
<script>
const DATA=__DATA__;
const MODES=DATA.modes, NAMES={vector:"vector",keyword:"keyword(similar)",hybrid:"hybrid"};
document.getElementById('genmeta').textContent=` モデル: ${DATA.models.join(" / ")} ・ n=${DATA.rows.length} ・ 生成 ${DATA.generated}`;
function badge(s){if(s===2)return '<span class="badge s2">2</span>';if(s===1)return '<span class="badge s1">1</span>';if(s===0)return '<span class="badge s0">0</span>';return '<span class="badge sx">-</span>';}
// summary tables
function sumTable(){
  let h='';
  for(const mid of DATA.models){
    const s=DATA.summaries[mid];
    h+=`<div class="modelname">${mid}</div>`;
    h+='<table><tr><th>セット</th><th>n</th>';
    for(const m of MODES)h+=`<th class="${m[0]}">${NAMES[m]}<br>mean / =2% / =0%</th>`;
    h+='<th>単独勝ち V/K/H/tie</th></tr>';
    for(const set of ["ALL","JP","EN"]){
      const r=s[set];if(!r||!r.n)continue;
      h+=`<tr><td>${set}</td><td>${r.n}</td>`;
      let bestm=MODES.reduce((a,b)=>r[b].mean>r[a].mean?b:a);
      for(const m of MODES){const cls=(m===bestm)?'best ':'';h+=`<td class="${cls}${m[0]}">${r[m].mean.toFixed(3)} / ${r[m].p2}% / ${r[m].p0}%</td>`;}
      h+=`<td>${r.best.vector}/${r.best.keyword}/${r.best.hybrid}/${r.best.tie}</td></tr>`;
    }
    h+='</table>';
  }
  document.getElementById('summary').innerHTML=h;
}
// type filter options
const types=[...new Set(DATA.rows.map(r=>r.type))].sort();
const tf=document.getElementById('typef');types.forEach(t=>{const o=document.createElement('option');o.textContent=t;tf.appendChild(o);});
function divergent(row){ // どこかのモデルで3手法スコアが割れている
  for(const mid of DATA.models){const m=row.m[mid];if(!m)continue;const ss=MODES.map(x=>m[x].s);if(new Set(ss).size>1)return true;}
  return false;
}
function render(){
  const q=document.getElementById('search').value.toLowerCase();
  const sf=document.getElementById('setf').value, tff=document.getElementById('typef').value;
  const dv=document.getElementById('divonly').checked;
  let rows=DATA.rows.filter(r=>(!sf||r.set===sf)&&(!tff||r.type===tff)&&(!q||r.q.toLowerCase().includes(q)||r.file.toLowerCase().includes(q))&&(!dv||divergent(r)));
  document.getElementById('count').textContent=`${rows.length} 件`;
  let h='';
  for(const r of rows){
    h+=`<div class="q"><div class="qhead">${escape0(r.q)}</div>`;
    h+=`<div class="qmeta"><span class="tag">${r.set}</span><span class="tag">${r.type}</span><span class="tag">${r.domain}</span><span class="tag">📄 ${r.file}</span></div>`;
    for(const mid of DATA.models){
      const m=r.m[mid];if(!m)continue;
      if(DATA.models.length>1)h+=`<div class="modelname">${mid}　best: <b>${m.best}</b>${m.note?` ・${m.note}`:''}</div>`;
      h+='<div class="cols">';
      for(const md of MODES){
        const win=(m.best===md)?` winner-${md[0]}`:'';
        h+=`<div class="col${win}"><h4 class="${md[0]}">${NAMES[md]} ${m.best===md?'<span class="star">★</span>':''} ${badge(m[md].s)}</h4><div class="ans">${escape0(m[md].a)||'<span class=muted>(空)</span>'}</div></div>`;
      }
      h+='</div>';
      if(m.reason)h+=`<div class="reason">${escape0(m.reason)}</div>`;
    }
    h+='</div>';
  }
  document.getElementById('list').innerHTML=h||'<p class=muted>該当なし</p>';
}
function escape0(s){return (s==null?'':String(s)).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function fmt(n){return n.toLocaleString();}
function costTable(){
  let h='';
  for(const mid of DATA.models){
    const t=DATA.tokens[mid];if(!t)continue;
    h+=`<div class="modelname">${mid} <span class="muted">(単価/1M: in $${t.rate.in} / out $${t.rate.out} / embed $${t.rate.emb} ・ ${t.requests} リクエスト)</span></div>`;
    h+='<table><tr><th>手法</th><th>LLM入力</th><th>LLM出力</th><th>embed</th><th>金額($)</th></tr>';
    for(const m of MODES){const b=t.byMode[m];h+=`<tr><td class="${m[0]}">${NAMES[m]}</td><td>${fmt(b.llmIn)}</td><td>${fmt(b.llmOut)}</td><td>${fmt(b.embedTokens)}</td><td>$${b.cost.toFixed(3)}</td></tr>`;}
    const T=t.total;h+=`<tr class="best"><td>合計</td><td>${fmt(T.llmIn)}</td><td>${fmt(T.llmOut)}</td><td>${fmt(T.embedTokens)}</td><td>$${T.cost.toFixed(3)}</td></tr>`;
    h+='</table>';
    h+=`<p class="muted">1リクエスト(3手法合算) ≒ $${t.perRequestCost.toFixed(4)} ・ 1回答 ≒ $${t.perAnswerCost.toFixed(4)}</p>`;
  }
  // モデル横断の総額
  if(DATA.models.length>1){
    let g=DATA.models.reduce((a,mid)=>a+(DATA.tokens[mid]?.total.cost||0),0);
    h+=`<p><b>全モデル生成 総額: $${g.toFixed(3)}</b></p>`;
  }
  document.getElementById('cost').innerHTML=h;
}
sumTable();costTable();render();
for(const id of ['search','setf','typef','divonly'])document.getElementById(id).addEventListener('input',render);
</script></body></html>"""

html_doc = html_doc.replace("__DATA__", json.dumps(DATA, ensure_ascii=False))
open(os.path.join(OUT, "h2h-report.html"), "w").write(html_doc)
print(f"models: {[m for m,_ in MODELS]}")
print(f"comparison.json: {len(comparison)} questions")
print(f"wrote {OUT}/h2h-comparison.json and {OUT}/h2h-report.html")
for mid in summaries:
    s = summaries[mid]["ALL"]
    print(f"  {mid} ALL: " + " ".join(f"{m}={s[m]['mean']}" for m in MODES))
