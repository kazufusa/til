#include "stdio.h"
#include "stdlib.h"

int gcdCore(int a, int b) {
  int tmp;
  if (a == 0 || b == 0) {
    return 0;
  }
  if (a < b) {
    tmp = b;
    b = a;
    a = tmp;
  }
  while (a != 0 && b != 0) {
    tmp = b;
    b = a % b;
    a = tmp;
  }

  if (a > b) {
    return a;
  } else {
    return b;
  }
}

int gcd(int *nums, int n) {
  switch (n) {
  case 0:
    return 0;
  case 1:
    return nums[0];
  case 2:
    return gcdCore(nums[0], nums[1]);
  default:
    nums[1] = gcdCore(nums[0], nums[1]);
    return gcd(nums + 1, n - 1);
  }
}

int main() {
  int nums[] = {140, 70, 21};
  int n = 3;
  for (int i =0;i<n;i++) {
    printf("%d,", nums[i]);
  }
  printf(" の最大公約数は %d です。\n", gcd(nums, n));
  return EXIT_SUCCESS;
}
