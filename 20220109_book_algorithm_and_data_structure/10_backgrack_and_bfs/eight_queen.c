#include "stdio.h"
#include "stdlib.h"

#define SUCCESS 0
#define FAILURE -1

// index: y, value: x, and (x,y) is Queen.
int board[8];

// isValid tests the new position(x,y) is valid or not.
int isValid(int x, int y) {
  int i;
  for (i = 0; i < y; i++) {
    if (board[i] == x || abs(board[i] - x) == abs(i - y)) {
      return FAILURE;
    }
  }
  return SUCCESS;
}

// print prints current board.
void print() {
  int i, j;
  printf("========\n");
  for (i = 0; i < 8; i++) {
    for (j = 0; j < board[i]; j++) {
      printf("-");
    }
    printf("x");
    for (j = board[i] + 1; j < 8; j++) {
      printf("-");
    }
    printf("\n");
  }
}

// solve lists up the solutions and prints out them
void solve(int y) {
  int x, ret;
  if (y == 8) {
    print();
    return;
  }
  for (x = 0; x < 8; x++) {
    if (isValid(x, y) == FAILURE) {
      continue;
    }
    board[y] = x;
    solve(y + 1);
  }
  return;
}

int main() {
  for (int i = 0; i < 8; i++) {
    board[i] = 0;
  }
  solve(0);
  return EXIT_SUCCESS;
}
