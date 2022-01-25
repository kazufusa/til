#include "stdio.h"
#include "stdlib.h"

void n2array(int *x, int n) {
  x[0] = n / 1000;
  x[1] = (n / 100) % 10;
  x[2] = (n / 10) % 10;
  x[3] = n % 10;
}

void x_sequence() {}

void add_op(){ }

void eval(){ }

int main() {
  int x[4], i;
  for (i = 0; i < 10000; i++) {
    n2array(x, i);
  }

  return EXIT_SUCCESS;
}
