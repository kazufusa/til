#include "stdio.h"
#include "stdlib.h"
#include "time.h"

#define NOT_FOUND (-1)
#define N (10)

int linear_search(int x, int a[], int n) {
  int i, tmp;
  i = 0;
  tmp = a[n - 1];
  a[n - 1] = x;
  while (a[i] != x) {
    i++;
  }
  if (i < n - 1) {
    return i;
  }
  if (x == tmp) {
    return n-1;
  }
  return NOT_FOUND;
}

int main() {
  int i, r, array[N];
  srand((unsigned int)(time(NULL)));

  for (i = 0; i < N; i++) {
    array[i] = rand() % 20;
    printf("%d %3d\n", i, array[i]);
  }
  printf("\n何を探しますか?:");
  scanf("%d", &i);

  r = linear_search(i, array, N);
  if (r == NOT_FOUND) {
    printf("%dは見つかりません\n", i);
  } else {
    printf("%dは%d番目です\n", i, r);
  }

  return EXIT_SUCCESS;
}
