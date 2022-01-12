#include "stdio.h"
#include "stdlib.h"
#include "time.h"

#define NOT_FOUND (-1)
#define N (10)

int self_organized_search(int x, int a[], int n) {
  int i, tmp;
  for (i = 0; i < n; i++) {
    if (a[i] == x) {
      if (i > 0) {
        tmp = a[i];
        a[i] = a[i - 1];
        a[i - 1] = tmp;
      }
      return i;
    }
  }
  return NOT_FOUND;
}

int main() {
  int i, r, array[N];

  srand((unsigned int)time(NULL));
  for (i = 0; i < N; i++) {
    array[i] = rand() % 20;
    printf("%d %3d\n", i, array[i]);
  }
  printf("\n何を探しますか?:");
  scanf("%d", &i);

  r = self_organized_search(i, array, N);
  if (r == NOT_FOUND) {
    printf("%dは見つかりません\n", i);
  } else {
    printf("%dは%d番目です\n", i, r);
  }

  return EXIT_SUCCESS;
}
