# terraform/nlb.tf
locals {
  node_port = 30080
}

resource "aws_security_group" "nlb" {
  name        = "${local.name_prefix}-nlb"
  description = "NLB: allow HTTP from CloudFront only"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-nlb"
  }
}

# 入口を CloudFront 1 本にする。NLB の DNS 名を直接叩いても届かない
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_vpc_security_group_ingress_rule" "nlb_http" {
  security_group_id = aws_security_group.nlb.id
  description       = "HTTP from CloudFront"
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
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
  internal           = false
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.nlb.id]
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
