#include "stdio.h"
#include "stdlib.h"
#include "time.h"

#define NOT_FOUND (-1)
#define N (10)

int binary_search_2(int x, int a[], int n) {
  int left, right, mid;
  for (left = 0, right = n - 1; left < right;) {
    mid = (left + right) / 2;
    if (a[mid] < x) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  if (a[left] == x) {
    return left;
  }

  return NOT_FOUND;
}

int main() {
  int i, r, array[N];
  srand((unsigned int)time(NULL));

  printf("0 %3d\n", array[0] = rand() % 3);
  for (i = 1; i < N; i++) {
    printf("%d %3d\n", i, array[i] = array[i - 1] + rand() % 3);
  }
  printf("何を探しますか?:");
  scanf("%d", &i);

  r = binary_search_2(i, array, N);
  if (r == NOT_FOUND) {
    printf("%dは見つかりません\n", i);
  } else {
    printf("%dは%d番目です", i, r);
  }

  return EXIT_SUCCESS;
}
