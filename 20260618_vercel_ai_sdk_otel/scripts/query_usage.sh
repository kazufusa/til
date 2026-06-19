#!/usr/bin/env bash
# このアプリが Cloud Monitoring に送った token 使用量を集計して表示する。
# gcloud には時系列を読むコマンドが無いので Monitoring REST API を叩く。
#
# 使い方:
#   PROJECT=learn-gcp-366113 ./scripts/query_usage.sh [過去何時間か(既定:24)]
set -euo pipefail

PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
HOURS="${1:-24}"
METRIC="workload.googleapis.com/gen_ai.client.token.usage"

TOK="$(gcloud auth print-access-token)"
END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START="$(date -u -d "${HOURS} hours ago" +%Y-%m-%dT%H:%M:%SZ)"

# CUMULATIVE カウンタなので ALIGN_DELTA で期間差分にし、
# token type (input/output) ごとに REDUCE_SUM で合計する。
curl -s -G "https://monitoring.googleapis.com/v3/projects/${PROJECT}/timeSeries" \
  -H "Authorization: Bearer ${TOK}" \
  --data-urlencode "filter=metric.type=\"${METRIC}\"" \
  --data-urlencode "interval.startTime=${START}" \
  --data-urlencode "interval.endTime=${END}" \
  --data-urlencode "aggregation.alignmentPeriod=$((HOURS * 3600))s" \
  --data-urlencode "aggregation.perSeriesAligner=ALIGN_DELTA" \
  --data-urlencode "aggregation.crossSeriesReducer=REDUCE_SUM" \
  --data-urlencode 'aggregation.groupByFields=metric.label."service_name"' \
  --data-urlencode 'aggregation.groupByFields=metric.label."gen_ai_token_type"'
