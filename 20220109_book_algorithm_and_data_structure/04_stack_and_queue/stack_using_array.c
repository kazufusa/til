#include "stdio.h"
#include "stdlib.h"

#define N (10)
#define SUCCESS (0)
#define FAILURE (-1)

int stack[N];
int stackpoint;

int push(int n) {
  if (stackpoint == N - 1) {
    return FAILURE;
  }
  stack[++stackpoint] = n;
  return SUCCESS;
}

int pop(int *n) {
  if (stackpoint == -1) {
    return FAILURE;
  }
  *n = stack[stackpoint--];
  return SUCCESS;
}

int main() {
  int i, r;
  stackpoint = -1;

  do {
    printf("Please input value to push, and end with 0:");
    scanf("%d", &i);
  } while (i != 0 && push(i) == SUCCESS);

  // pop values from stack
  printf("pop all values from stack\n");
  while (pop(&i) == SUCCESS) {
    printf("%d ", i);
  }
  return EXIT_SUCCESS;
}
