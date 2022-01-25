#include "stdio.h"
#include "stdlib.h"

#define N 10
#define NSEP 3
#define MAX(a, b) (((a) > (b)) ? (a) : (b))

int VALUES[N] = {15, 3, 7, 6, 10, 4, 13, 2, 3, 6};
int MAX = 1000000;

typedef struct {
  int sum;
  int n;
} Cell;

void print(Cell **table) {
  int i, j;
  for (i = 0; i < N; i++) {
    printf("%5d   ", VALUES[i]);
  }
  printf("\n");
  for (i = 0; i < NSEP + 1; i++) {
    for (j = 0; j < N; j++) {
      printf("(%2d, %02d)", table[i][j].n, table[i][j].sum);
    }
    printf("\n");
  }
}

void solve_dp() {
  int i, j, s, sum;
  Cell **table;
  table = (Cell **)malloc(sizeof(Cell *) * (NSEP + 1));
  for (i = 0; i < NSEP + 1; i++) {
    table[i] = (Cell *)malloc(sizeof(Cell) * N);
  }
  print(table);

  for (i = N - 1; i >= 0; i--) {
    for (j = 0; j < NSEP + 1; j++) {
      table[j][i].sum = 0;
      for (sum = 0, s = i; s < N; ++s) {
        sum += VALUES[s];
        if (j == 0 || i == N - 1 || table[j][i].n == 0 ||
            (s != N - 1 &&
             table[j][i].sum > MAX(sum, table[j - 1][s + 1].sum))) {
          if (j == 0 || i == N - 1) {
            table[j][i].sum = sum;
          } else {
            table[j][i].sum = MAX(sum, table[j - 1][s + 1].sum);
          }
          table[j][i].n = s - i + 1;
        }
      }
    }
  }

  print(table);

  for (i = 0; i < NSEP + 1; i++) {
    free(table[i]);
  }
  free(table);
}

int main() {
  solve_dp();
  return EXIT_SUCCESS;
}
