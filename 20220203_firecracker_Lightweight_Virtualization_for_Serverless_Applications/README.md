# Firecracker: Lightweight Virtualization for Serverless Applications

https://assets.amazon.science/96/c6/302e527240a3b1f86c86c3e8fc3d/firecracker-lightweight-virtualization-for-serverless-applications.pdf

## Abstract

サーバーレスコンテナとファンクションは, 管理コストの削減, よりよいハードウェアの有効活用, より高速なスケーリングなどの優位点により, クラウドソフトウェアのデプロイや管理に広く使われている.
サーバーレスアプリケーションは, 複数の顧客のworkloadを同じハードウェ上で低オーバーヘッドで動作可能で, かつ強いセキュリティとパフォーマンス分離が行える必要がある。
これまでは, 強セキュリティ高オーバーヘッドの仮想化と弱セキュリティ低オーバーヘッドのコンテナ技術があった。
このtradeoffはインフラ提供者としては許容できない. 強セキュリティ低オーバーヘッドが必要.
というわけで Firecrackerを作った, new open source Virtual Machine Monitor(VMM), サーバーレスに特化しているが一般的なコンテナやファンクション等にもつかえる. リーズナブルな制約(セキュリティ)と共に.
これは現在AWSのLambdaとFargateで動いてます. 数百万のproduction workloadsと毎月兆単位のリクエストをさばいています.
Firecrackerの解説とシームレスなLambdaからFirecrackerへの移行について解説します.

## Introduction

サーバーレスのいいところ.

1. サーバ管理やマネージメントキャパシティの削減
2. オートスケーリング
3. pay-for-use pricing(従量課金?)
4. イベントソースとストリーミングデータの統合(???)

Multitenancyは経済的に有利だが, workloadsの分離が困難である. workloadsはセキュリティ面から, また操作面から, それぞれ分離されなければならない.
AWS EC2のようなClound instanceはhypervisor based virtualization(QEMU/KVM or Xen)によって, あるいはbare-metal instancesによって, これを解決した.
Serverless and container modelsは多くのworkloadsを1つのマシン上で動作でき, multitenancyの経済的な有効性を示したが, workloadの分離にはオーバーヘッドがかかる.

### Docker and LXC

1. control gropus(croupgs) provides process grouping, resource throttling and accounting
2. namespaces separates Linux kernel resources (e.g. PIDs) into namespaces
3. seccomp-bpf controls access to syscalls
