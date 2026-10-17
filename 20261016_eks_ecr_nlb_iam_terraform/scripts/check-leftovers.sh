#!/usr/bin/env bash
# destroy 後に実験の資源が残っていないかを確認する。残骸があれば終了コード 1。
# state バケット(Project=eks-exp-state)は意図して対象外。
set -uo pipefail

REGION="${AWS_REGION:-ap-northeast-1}"
export AWS_DEFAULT_REGION="$REGION"
fail=0

check() {
  # check <label> <command...>  コマンドは残骸を 1 行 1 件で出す
  local label="$1"; shift
  local out
  out="$("$@" 2>&1)" || { echo "ERROR $label: $out"; fail=1; return; }
  if [[ -n "$out" ]]; then
    echo "LEFTOVER $label:"
    echo "$out" | sed 's/^/  /'
    fail=1
  else
    echo "ok $label"
  fi
}

# default 以外の VPC に属する SG だけを見る(default VPC には実験の資源を作らない)
non_default_sgs() {
  local vpcs
  vpcs="$(aws ec2 describe-vpcs --filters Name=is-default,Values=false --query 'Vpcs[].VpcId' --output text)"
  [[ -z "$vpcs" ]] && return 0
  # shellcheck disable=SC2086
  aws ec2 describe-security-groups --filters Name=vpc-id,Values=$(echo $vpcs | tr ' ' ',') \
    --query "SecurityGroups[?GroupName!='default'].GroupId" --output text
}

check "tag Project=eks-exp" \
  aws resourcegroupstaggingapi get-resources --tag-filters Key=Project,Values=eks-exp \
  --query 'ResourceTagMappingList[].ResourceARN' --output text
check "eks clusters" \
  aws eks list-clusters --query 'clusters[]' --output text
check "ecr repositories" \
  aws ecr describe-repositories --query 'repositories[].repositoryName' --output text
check "load balancers" \
  aws elbv2 describe-load-balancers --query 'LoadBalancers[].LoadBalancerName' --output text
check "target groups" \
  aws elbv2 describe-target-groups --query 'TargetGroups[].TargetGroupName' --output text
check "auto scaling groups" \
  aws autoscaling describe-auto-scaling-groups --query 'AutoScalingGroups[].AutoScalingGroupName' --output text
check "nat gateways" \
  aws ec2 describe-nat-gateways --filter Name=state,Values=pending,available,deleting \
  --query 'NatGateways[].NatGatewayId' --output text
check "elastic ips" \
  aws ec2 describe-addresses --query 'Addresses[].AllocationId' --output text
check "non-default vpcs" \
  aws ec2 describe-vpcs --filters Name=is-default,Values=false --query 'Vpcs[].VpcId' --output text
check "security groups in non-default vpcs" non_default_sgs
check "iam roles" \
  aws iam list-roles \
  --query "Roles[?starts_with(RoleName,'eks-exp') || RoleName=='app-deployer' || RoleName=='tf-builder'].RoleName" \
  --output text
check "iam policies" \
  aws iam list-policies --scope Local \
  --query "Policies[?starts_with(PolicyName,'eks-exp') || starts_with(PolicyName,'app-deployer') || starts_with(PolicyName,'tf-builder')].PolicyName" \
  --output text
check "eks log groups" \
  aws logs describe-log-groups --log-group-name-prefix /aws/eks/ \
  --query 'logGroups[].logGroupName' --output text

if [[ "$fail" -ne 0 ]]; then
  echo "RESULT: leftovers found"
  exit 1
fi
echo "RESULT: clean"
