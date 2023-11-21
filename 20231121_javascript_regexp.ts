const txt = "category1（aaa、bbb、ccc）、category2（bbb、ccc、ddd）、category3（ddd、eee、fff）"

const tc = "category2"
const gs = "ccc"

const ret = txt.split("）、").flatMap((v) => v.match(new RegExp(`^${tc}（(.*)$`))?.[1] ?? []).some(v => v.split("、").some((v) => v === gs))
console.log(ret)
