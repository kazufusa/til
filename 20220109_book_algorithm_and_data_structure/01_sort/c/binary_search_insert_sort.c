#include "stdio.h"
#include "stdlib.h"
#include "time.h"

#define N 10

int sort[N];

void simple_insert_sort(int n, int x[]) {
  int i, sorted, insert, tmp;
  int left, right, mid;
  for (sorted = 0; sorted < n - 1; sorted++) {

    // the value after the sorted area
    insert = sort[sorted + 1];

    // binary search sort[i] which is the insert target
    left = 0;
    right = sorted;
    while (left != right) {
      mid = (left + right) / 2;
      if (x[mid] <= insert) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    i = left;

    while (i <= sorted) {
      tmp = sort[i];
      sort[i] = insert;
      insert = tmp;
      i++;
    }
  }
}

int main() {
  int i;
  srand((unsigned int)time(NULL));

  printf("# ソート準備\n");
  for (i = 0; i < N; i++) {
    sort[i] = rand();
    printf("%10d\n", sort[i]);
  }

  printf("\n# ソート実施\n");
  simple_insert_sort(N, sort);

  printf("\n# ソート終了\n");
  for (i = 0; i < N; i++) {
    printf("%10d\n", sort[i]);
  };

  return EXIT_SUCCESS;
}
