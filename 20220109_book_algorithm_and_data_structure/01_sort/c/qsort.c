#include "stdio.h"
#include "stdlib.h"
#include "time.h"

#define N 10 // データ件数

int sort[N];

int compare(const void *arg1, const void *arg2){
  return (*((int *)arg1) - *((int *)arg2));
}

int main(void) {
  int i;

  srand((unsigned int)time(NULL));

  printf("ソート準備:\n");

  for (i = 0; i < N; i++) {
    sort[i] = rand();
    printf("%10d\n", sort[i]);
  }

  printf("\nソート開始:\n");
  qsort(sort, N, sizeof(sort[0]), compare);

  printf("\nソート終了:\n");
  for (i = 0; i < N; i++) {
    printf("%10d\n", sort[i]);
  }
}
