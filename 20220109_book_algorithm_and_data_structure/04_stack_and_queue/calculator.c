#include "stdio.h"
#include "stdlib.h"
#include "string.h"

#define N (100)

double stack[100];
int sp = 0;

static const int SUCCEEDED = 1;
static const int FAILED = 0;

void print() {
  printf("current stack: ");
  for (int i = 0; i < sp; i++) {
    printf("%.2f ", stack[i]);
  }
  printf("\n");
}

int pop(double *ret) {
  if (sp == 0) {
    return FAILED;
  }
  *ret = stack[--sp];
  return SUCCEEDED;
}

int push(double v) {
  if (sp == N) {
    return FAILED;
  }
  stack[sp++] = v;
  return SUCCEEDED;
}

int main() {
  char buf[256];
  int ret;
  double v1, v2;
  while (1) {
    print();
    fgets(buf, 256, stdin);
    switch (buf[0]) {
    case '=':
      if (sp > 1) {
        printf("数値が残っています\n");
        return EXIT_FAILURE;
      } else if (sp == 1) {
        printf("計算結果: %f", stack[0]);
        return EXIT_SUCCESS;
      } else {
        printf("計算してません\n");
        return EXIT_FAILURE;
      }
      break;
    case '+':
      ret = pop(&v1);
      if (ret != SUCCEEDED) {
        printf("数値が足りません(stack undeflow)\n");
        return EXIT_FAILURE;
      }
      ret = pop(&v2);
      if (ret != SUCCEEDED) {
        printf("数値が足りません(stack undeflow)\n");
        return EXIT_FAILURE;
      }
      ret = push(v1 + v2);
      if (ret != SUCCEEDED) {
        printf("スタックオーバーフローです(stack overflow)\n");
        return EXIT_FAILURE;
      }
      break;
    case '-':
      ret = pop(&v1);
      if (ret != SUCCEEDED) {
        printf("数値が足りません(stack undeflow)\n");
        return EXIT_FAILURE;
      }
      ret = pop(&v2);
      if (ret != SUCCEEDED) {
        printf("数値が足りません(stack undeflow)\n");
        return EXIT_FAILURE;
      }
      ret = push(v1 - v2);
      if (ret != SUCCEEDED) {
        printf("スタックオーバーフローです(stack overflow)\n");
        return EXIT_FAILURE;
      }
      break;
    case '*':
      ret = pop(&v1);
      if (ret != SUCCEEDED) {
        printf("数値が足りません(stack undeflow)\n");
        return EXIT_FAILURE;
      }
      ret = pop(&v2);
      if (ret != SUCCEEDED) {
        printf("数値が足りません(stack undeflow)\n");
        return EXIT_FAILURE;
      }
      ret = push(v1 * v2);
      if (ret != SUCCEEDED) {
        printf("スタックオーバーフローです(stack overflow)\n");
        return EXIT_FAILURE;
      }
      break;
    case '/':
      ret = pop(&v1);
      if (ret != SUCCEEDED) {
        printf("数値が足りません(stack undeflow)\n");
        return EXIT_FAILURE;
      }
      ret = pop(&v2);
      if (ret != SUCCEEDED) {
        printf("数値が足りません(stack undeflow)\n");
        return EXIT_FAILURE;
      }
      ret = push(v2 / v1);
      if (ret != SUCCEEDED) {
        printf("スタックオーバーフローです(stack overflow)\n");
        return EXIT_FAILURE;
      }
      break;
    default:
      push(atoi(buf));
      break;
    }
  }
  return EXIT_SUCCESS;
}
