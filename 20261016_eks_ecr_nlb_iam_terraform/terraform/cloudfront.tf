# ELB の既定ドメインには証明書を付けられないため、CloudFront の既定ドメイン(*.cloudfront.net)で HTTPS を提供する。
# キャッシュは無効。HTTP で来た場合は HTTPS にリダイレクトする。CloudFront から NLB へは HTTP。
resource "aws_cloudfront_distribution" "main" {
  enabled         = true
  comment         = "${local.name_prefix} HTTPS entry"
  is_ipv6_enabled = true
  price_class     = "PriceClass_200"

  origin {
    domain_name = aws_lb.main.dns_name
    origin_id   = "nlb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "nlb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    # AWS 管理ポリシー: CachingDisabled と AllViewer(ID は AWS 公開の固定値)
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id = "216adef6-5c7f-47e4-b989-5492eafa07d3"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
