#include "stdio.h"
#include "stdlib.h"

#define N (10)

int stack[N];
int stackpoint;

int main() {
  int i;
  stackpoint = -1;

  // add value to stack
  while (stackpoint < N - 1) {
    stackpoint++;
    stack[stackpoint] = stackpoint;
  }

  // pop values from stack
  for (; stackpoint >= 0; stackpoint--) {
    printf("%d \n", stack[stackpoint]);
  }
  return EXIT_SUCCESS;
}
