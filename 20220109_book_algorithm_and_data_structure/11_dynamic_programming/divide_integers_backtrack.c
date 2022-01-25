#include "stdio.h"
#include "stdlib.h"

#define N 10
#define NSEP 3

int VALUES[N] = {15, 3, 7, 6, 10, 4, 13, 2, 3, 6};
int MAX = 1000000;
int SEP_POSITION[NSEP] = {0};
int BEST_SEP_POSITION[NSEP] = {0};

int max() {
  int i, max, sum;
  max = 0;
  for (i = 0; i <= SEP_POSITION[0]; i++) {
    max += VALUES[i];
  }

  sum = 0;
  for (i = SEP_POSITION[0] + 1; i <= SEP_POSITION[1]; i++) {
    sum += VALUES[i];
  }
  if (max < sum) {
    max = sum;
  }

  sum = 0;
  for (i = SEP_POSITION[1] + 1; i <= SEP_POSITION[2]; i++) {
    sum += VALUES[i];
  }
  if (max < sum) {
    max = sum;
  }

  sum = 0;
  for (i = SEP_POSITION[2] + 1; i < N; i++) {
    sum += VALUES[i];
  }
  if (max < sum) {
    max = sum;
  }
  return max;
}

void print() {
  int i, j = 0;
  for (i = 0; i < N; i++) {
    printf("%d ", VALUES[i]);
    for (j = 0; j < NSEP; j++) {
      if (i == SEP_POSITION[j]) {
        printf("│ ");
      }
    }
  }
  printf("\n");
}

void print_sums() {
  int i, sum;
  sum = 0;
  for (i = 0; i <= SEP_POSITION[0]; i++) {
    sum += VALUES[i];
  }
  printf("%d ", sum);

  sum = 0;
  for (i = SEP_POSITION[0] + 1; i <= SEP_POSITION[1]; i++) {
    sum += VALUES[i];
  }
  printf("%d ", sum);

  sum = 0;
  for (i = SEP_POSITION[1] + 1; i <= SEP_POSITION[2]; i++) {
    sum += VALUES[i];
  }
  printf("%d ", sum);

  sum = 0;
  for (i = SEP_POSITION[2] + 1; i < N; i++) {
    sum += VALUES[i];
  }
  printf("%d ", sum);

  printf("\n");
}

void solve_backtrack(int is) {
  int i, m;
  if (is == NSEP) {
    m = max();
    if (m < MAX) {
      MAX = m;
      for (i = 0; i < NSEP; i++) {
        BEST_SEP_POSITION[i] = SEP_POSITION[i];
      }
    }
    return;
  }

  for (i = SEP_POSITION[is - 1]; i < N; i++) {
    SEP_POSITION[is] = i;
    solve_backtrack(is + 1);
  }
}

int main() {
  int i;
  SEP_POSITION[0] = 0;
  solve_backtrack(1);
  for (i = 0; i < NSEP; i++) {
    SEP_POSITION[i] = BEST_SEP_POSITION[i];
  }
  print();
  print_sums();
  return EXIT_SUCCESS;
}
