# How to connect to AWS S3 from Cloud Compose

https://cloud.google.com/bigquery/docs/omni-aws-create-connection

## 必要なもの

1. BigQuery OmniとBigquery Connection APIの両方が有効になっているGoogle Cloud Project
  - BigQuery Omni: Amazon S3, Azure blobをBigQueryから利用するための機能
2. An AWS Account
3. Permission to modify IAM policies in AWS

## Creating an AWS IAM policy for BigQuery

### AWS console

1. Go to the AWS Identity and Access Management (IAM) console. Make sure that you're in the account that owns the S3 bucket that you want to access.
2. Select Policies > Create policy (opens in a new tab).
3. Click JSON and paste the following into the editor.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::BUCKET_NAME"]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": ["arn:aws:s3:::BUCKET_NAME"]
    }
  ]
}
```

### Terraform

```terraform
resource "aws_iam_policy" "bigquery-omni-connection-policy" {
  name = "bigquery-omni-connection-policy"

  policy = <<-EOF
          {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "BucketLevelAccess",
                    "Effect": "Allow",
                    "Action": ["s3:ListBucket"],
                    "Resource": ["arn:aws:s3:::BUCKET_NAME"]
                },
                {
                    "Sid": "ObjectLevelAccess",
                    "Effect": "Allow",
                    "Action": ["s3:GetObject"],
                    "Resource": ["arn:aws:s3:::BUCKET_NAME"]
                }
            ]
          }
          EOF
}
```

### Created IAM policy

Create IAM policy with Amazon Resource Name(ARN) in the following format:

```
arn:aws:iam::AWS_ACCOUNT_ID:policy/POLICY_NAME
```

## Creating an AWS IAM role for BigQuery

```terraform
resource "aws_iam_role" "bigquery-omni-connection-role" {
  name                 = "bigquery-omni-connection"
  max_session_duration = 43200

  assume_role_policy = <<-EOF
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "Federated": "accounts.google.com"
        },
        "Action": "sts:AssumeRoleWithWebIdentity",
        "Condition": {
          "StringEquals": {
            "accounts.google.com:sub": "00000"
          }
        }
      }
    ]
  }
  EOF
}

resource "aws_iam_role_policy_attachment" "bigquery-omni-connection-role-attach" {
  role       = aws_iam_role.bigquery-omni-connection-role.name
  policy_arn = aws_iam_policy.bigquery-omni-connection-policy.arn
}

output "bigquery_omni_role" {
  value = aws_iam_role.bigquery-omni-connection-role.arn
}
```
