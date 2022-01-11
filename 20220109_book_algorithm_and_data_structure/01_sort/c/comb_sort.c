#include "stdio.h"
#include "stdlib.h"
#include "time.h"

#define N 10

int sort[N];

void comb_sort(int n, int x[]) {
  int i, tmp, flag, gap;
  gap = N;
  while (gap > 1 || flag != 1) {
    gap = gap * 10 / 13;
    if (gap == 0) {
      gap = 1;
    }

    flag = 0;
    for (i = 0; i < N - gap; i++) {
      if (x[i] > x[i + gap]) {
        tmp = x[i];
        x[i] = x[i + gap];
        x[i + gap] = tmp;
        flag = 1;
      }
    }
  }
}

int main() {
  int i;

  srand((unsigned long)time(NULL));

  printf("# ソート準備\n");
  for (i = 0; i < N; i++) {
    sort[i] = rand();
    printf("%10d\n", sort[i]);
  }

  printf("\n# ソート開始\n");
  comb_sort(N, sort);

  printf("\n# ソート終了\n");
  for (i = 0; i < N; i++) {
    printf("%10d\n", sort[i]);
  }

  return EXIT_SUCCESS;
}
