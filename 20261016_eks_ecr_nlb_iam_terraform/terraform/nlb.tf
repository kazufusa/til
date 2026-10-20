# terraform/nlb.tf
locals {
  node_port = 30080
}

resource "aws_security_group" "nlb" {
  name        = "${local.name_prefix}-nlb"
  description = "NLB: allow HTTP from within the VPC"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-nlb"
  }
}

# NLB は internal なので、届くのは VPC 内の送信元(ノード、CloudFront の VPC origin の ENI)だけ
resource "aws_vpc_security_group_ingress_rule" "nlb_http" {
  security_group_id = aws_security_group.nlb.id
  description       = "HTTP from within the VPC"
  cidr_ipv4         = aws_vpc.main.cidr_block
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "nlb_all" {
  security_group_id = aws_security_group.nlb.id
  description       = "all"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# EKS が自動生成するクラスタ SG(ノードにも付く)に、NLB からの NodePort を許可する
resource "aws_vpc_security_group_ingress_rule" "node_from_nlb" {
  security_group_id            = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
  description                  = "NodePort from NLB"
  referenced_security_group_id = aws_security_group.nlb.id
  from_port                    = local.node_port
  to_port                      = local.node_port
  ip_protocol                  = "tcp"
}

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-nlb"
  load_balancer_type = "network"
  internal           = true
  subnets            = aws_subnet.private[*].id
  security_groups    = [aws_security_group.nlb.id]

  # ノードが1台だけだと、ターゲットのいないAZのNLBノードに当たった接続が
  # タイムアウトする(CloudFrontで間欠的な504になる)ため、AZをまたいで分散する
  enable_cross_zone_load_balancing = true
}

resource "aws_lb_target_group" "nodeport" {
  name        = "${local.name_prefix}-nodeport"
  port        = local.node_port
  protocol    = "TCP"
  target_type = "instance"
  vpc_id      = aws_vpc.main.id

  health_check {
    protocol = "TCP"
    port     = "traffic-port"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.nodeport.arn
  }
}

# node group が作る ASG を target group に紐づける(ノードの増減に追従する)
resource "aws_autoscaling_attachment" "nodeport" {
  autoscaling_group_name = aws_eks_node_group.main.resources[0].autoscaling_groups[0].name
  lb_target_group_arn    = aws_lb_target_group.nodeport.arn
}
