# terraform/deployer.tf
data "aws_iam_policy_document" "deployer_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = local.deployer_trusted_principals
    }
  }
}

resource "aws_iam_role" "deployer" {
  name               = "app-deployer"
  description        = "ECR push and kubectl against ${var.cluster_name}"
  assume_role_policy = data.aws_iam_policy_document.deployer_assume.json
}

data "aws_iam_policy_document" "deployer" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPushPullAppRepo"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:DescribeImages",
      "ecr:ListImages",
      "ecr:DescribeRepositories",
    ]
    resources = [aws_ecr_repository.app.arn]
  }

  statement {
    sid       = "EksKubeconfig"
    actions   = ["eks:DescribeCluster"]
    resources = [aws_eks_cluster.main.arn]
  }
}

resource "aws_iam_policy" "deployer" {
  name   = "app-deployer-policy"
  policy = data.aws_iam_policy_document.deployer.json
}

resource "aws_iam_role_policy_attachment" "deployer" {
  role       = aws_iam_role.deployer.name
  policy_arn = aws_iam_policy.deployer.arn
}

resource "aws_eks_access_entry" "deployer" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = aws_iam_role.deployer.arn
  type          = "STANDARD"
}

# namespace 限定の edit。RBAC や ResourceQuota の変更はできない
resource "aws_eks_access_policy_association" "deployer" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = aws_iam_role.deployer.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy"

  access_scope {
    type       = "namespace"
    namespaces = var.deployer_namespaces
  }

  depends_on = [aws_eks_access_entry.deployer]
}
