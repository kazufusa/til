# Direct VPC Egressと外部インターネット接続

## VPCに接続しつつインターネットにはCloud Runの動的ipで接続したい

```sh
gcloud run deploy helloworld \
    --project=${PROJECT} \
    --region=${LOCATION} \
    --network=${NETWORK} \
    --subnet=${SUBNET} \
    --vpc-egress=private-ranges-only \
    --allow-unauthenticated
  
```

networkとsubnetを設定したらDirect VPC egressが設定される.
subnetはRFC1918（10.x.x.x／192.168.x.x／172.16–31.x.x）でなければならない.

`vpc-egress=private-ranges-only`したら、private rangeのリクエストのみがVPCに流れる.
ちなみにデフォルト値なので、何もつけない場合はこの挙動になる


https://cloud.google.com/sdk/gcloud/reference/run/deploy#--vpc-egress

> private-ranges-only
> Default option. Sends outbound traffic to private IP addresses (RFC 1918 and Private Google Access IPs) through Direct VPC egress or the VPC connector.
> Traffic to other Cloud Run services might require additional configuration. See https://cloud.google.com/run/docs/securing/private-networking#send_requests_to_other_services_and_services for more information.
