#include "stdio.h"
#include "stdlib.h"

#define N 5
#define NAP_SIZE 16
int sizes[N] = {2, 3, 5, 6, 9};
int values[N] = {2, 4, 7, 10, 14};

int solve(int *sizes, int *values, int n, int max_size) {
  int *table, i, j, ret;
  table = (int *)calloc(max_size, sizeof(int));
  for (i = 0; i < n; i++) {
    for (j = 0; j < max_size; j++) {
      if (j + sizes[i] <= max_size &&
          table[j + sizes[i]] < table[j] + values[i]) {
        table[j + sizes[i]] = table[j] + values[i];
      }
    }
  }

  for (j = 0; j < max_size; j++) {
    printf("%d ", table[j]);
  }
  printf("\n");
  ret = table[max_size-1];
  free(table);
  return ret;
}

int main() {
  printf("%d\n", solve(sizes, values, N, NAP_SIZE));
  return EXIT_SUCCESS;
}
