# CloudWatch → イベント駆動 → Lambda → S3 の復元経路(拡張実験)

# 復元jsonlの保存先。自作経路のバケットとは分離する
resource "aws_s3_bucket" "cw_dumps" {
  bucket        = "${var.prefix}-cw-dumps-${local.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "cw_dumps" {
  bucket                  = aws_s3_bucket.cw_dumps.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "archive_file" "gate_dump" {
  type        = "zip"
  source_file = "${path.module}/lambda/index.py"
  output_path = "${path.module}/lambda/gate_dump.zip"
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "gate_dump_lambda" {
  name               = "${var.prefix}-gate-dump-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

data "aws_iam_policy_document" "gate_dump_lambda" {
  statement {
    sid = "OwnLogs"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/${var.prefix}-gate-dump*"]
  }

  statement {
    sid     = "ReadTelemetry"
    actions = ["logs:FilterLogEvents", "logs:GetLogEvents"]
    resources = [
      "arn:aws:logs:${var.region}:${local.account_id}:log-group:${var.spans_log_group}:*",
      "arn:aws:logs:${var.region}:${local.account_id}:log-group:${var.runtime_log_group}:*",
    ]
  }

  statement {
    sid       = "DumpToS3"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.cw_dumps.arn}/*"]
  }
}

resource "aws_iam_role_policy" "gate_dump_lambda" {
  name   = "${var.prefix}-gate-dump-lambda-policy"
  role   = aws_iam_role.gate_dump_lambda.id
  policy = data.aws_iam_policy_document.gate_dump_lambda.json
}

resource "aws_lambda_function" "gate_dump" {
  function_name    = "${var.prefix}-gate-dump"
  role             = aws_iam_role.gate_dump_lambda.arn
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = data.archive_file.gate_dump.output_path
  source_code_hash = data.archive_file.gate_dump.output_base64sha256
  timeout          = 300
  memory_size      = 256

  environment {
    variables = {
      DUMP_BUCKET       = aws_s3_bucket.cw_dumps.bucket
      SPANS_LOG_GROUP   = var.spans_log_group
      RUNTIME_LOG_GROUP = var.runtime_log_group
      WAIT_SECONDS      = "75"
    }
  }
}

resource "aws_lambda_permission" "from_spans_log_group" {
  statement_id   = "AllowSpansSubscription"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.gate_dump.function_name
  principal      = "logs.amazonaws.com"
  source_arn     = "arn:aws:logs:${var.region}:${local.account_id}:log-group:${var.spans_log_group}:*"
  source_account = local.account_id
}

resource "aws_cloudwatch_log_subscription_filter" "gate_fail" {
  name            = "${var.prefix}-gate-fail"
  log_group_name  = var.spans_log_group
  filter_pattern  = "\"verification_gate\" \"FAIL\""
  destination_arn = aws_lambda_function.gate_dump.arn

  depends_on = [aws_lambda_permission.from_spans_log_group]
}
