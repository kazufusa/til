# terraform/bastion.tf
# EKS の API サーバーはプライベートエンドポイントだけにし、踏み台を経由しないと届かないようにする。
# 踏み台は private subnet に置き、公開 IP も inbound の口も持たない。入口は SSM Session Manager だけ。
# 開発者と builder は、手元から SSM のポート転送で API サーバーへトンネルを張り、手元の kubectl と terraform を使う。
# IAM ロールと instance profile(<cluster_name>-bastion)は管理者が setup-iam.sh で作る
data "aws_iam_instance_profile" "bastion" {
  name = "${var.cluster_name}-bastion"
}

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-arm64"]
  }
}

resource "aws_security_group" "bastion" {
  name        = "${local.name_prefix}-bastion"
  description = "SSM bastion. No inbound."
  vpc_id      = aws_vpc.main.id

  # SSM のエンドポイント(NAT 経由)と、API サーバーへの転送に使う
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-bastion"
  }
}

# クラスタの SG に、踏み台からの 443 だけを足す
resource "aws_vpc_security_group_ingress_rule" "cluster_from_bastion" {
  security_group_id            = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
  referenced_security_group_id = aws_security_group.bastion.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  description                  = "API server from SSM bastion"
}

resource "aws_instance" "bastion" {
  ami                    = data.aws_ami.al2023.id
  # ポート転送の中継だけなので、一番小さい型にする(Arm なので AMI も arm64)
  instance_type          = "t4g.nano"
  subnet_id              = aws_subnet.private[0].id
  vpc_security_group_ids = [aws_security_group.bastion.id]
  iam_instance_profile   = data.aws_iam_instance_profile.bastion.name

  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    encrypted = true
  }

  tags = {
    Name = "${local.name_prefix}-bastion"
  }

  # 新しい AMI が出るたびに作り直されて instance ID が変わると、開発者の手順が狂う
  lifecycle {
    ignore_changes = [ami]
  }

  # SSM エージェントは NAT 経由で SSM に登録する
  depends_on = [aws_route_table_association.private]
}
