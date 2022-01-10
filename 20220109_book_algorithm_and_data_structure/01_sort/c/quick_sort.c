#include "stdio.h"
#include "stdlib.h"
#include "time.h"

#define N 10 // データ件数

int sort[N];

void quick_sort(int *in, int bottom, int top) {
  if (top <= bottom) {
    return;
  }

  int lower, upper, tmp;
  int div = in[bottom];

  for (lower = bottom, upper = top; lower <= upper;) {
    while (lower <= upper && in[lower] <= div) {
      lower++;
    }
    while (lower <= upper && div < in[upper]) {
      upper--;
    }
    if (lower < upper) {
      tmp = in[lower];
      in[lower] = in[upper];
      in[upper] = tmp;
    }
  }

  tmp = in[bottom];
  in[bottom] = in[upper];
  in[upper] = tmp;

  quick_sort(in, bottom, upper - 1);
  quick_sort(in, upper + 1, top);
};

int main(void) {
  int i;

  srand((unsigned int)time(NULL));

  printf("ソート準備:\n");

  for (i = 0; i < N; i++) {
    sort[i] = rand();
    printf("%2d %10d\n", i, sort[i]);
  }

  printf("\nソート開始:\n");
  quick_sort(sort, 0, N-1);

  printf("\nソート終了:\n");
  for (i = 0; i < N; i++) {
    printf("%2d %10d\n", i, sort[i]);
  }
}
