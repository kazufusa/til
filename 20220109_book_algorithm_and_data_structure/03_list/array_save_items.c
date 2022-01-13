#include "stdio.h"
#include "stdlib.h"
#include "string.h"

#define DEFAULT_N (10)

int main() {
  int i, j, in, r, n;
  n = DEFAULT_N;
  int *array, *tmp;
  array = (int *)malloc(n * sizeof(int));

  i = 0;
  while (1) {
    printf("整数を入力してください(0を入力すると終了:\n");
    r = scanf("%d", &in);
    if (r != 1 || in == 0) {
      break;
    }
    /* for (i = 0; i < 15;) { */
    /*   in = i; */
    if (i == n) {
      tmp = array;
      array = (int *)malloc(sizeof(int) * n * 2);
      memcpy(array, tmp, sizeof(int) * n);
      free(tmp);
      n = n * 2;
    }
    array[i++] = in;
  }

  for (int j = 0; j < i; j++) {
    printf("%d %d\n", j, array[j]);
  }

  free(array);
  return EXIT_SUCCESS;
}
