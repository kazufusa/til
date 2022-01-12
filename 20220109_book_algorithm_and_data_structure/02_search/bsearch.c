#include "stdio.h"
#include "stdlib.h"
#include "time.h"

#define NOT_FOUND (-1)
#define N (10)

int compare(const void *arg1, const void *arg2) {
  return (*((int *)arg1) - *((int *)arg2));
}

int main() {
  int i, array[N];
  srand((unsigned int)time(NULL));

  printf(" 0 %d\n", array[0] = rand() % 3);
  for (i = 1; i < N; i++) {
    printf(" %d %d\n", i, array[i] = array[i - 1] + rand() % 3);
  }
  printf("何を探しますか?:");
  scanf("%d", &i);

  fflush(stdout);
  int *r = bsearch(&i, array, N, sizeof(array[0]), compare);

  if (r == NULL) {
    printf("%dは見つかりません\n", i);
  } else {
    printf("%dは見つかりました\n", i);
  }

  return EXIT_SUCCESS;
}
