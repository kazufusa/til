#include "stdio.h"
#include "stdlib.h"
#include "string.h"

char OPs[5] = "+-*/";

float eval(char *s) {
  /* printf("%s\n", s); */
  int i, n = strlen(s), sp = 0;
  float stack[4] = {0};
  for (i = 0; i < n; i++) {
    /* for (int j=0;j<4;j++) { */
    /*   printf("%10.3f ", stack[j]); */
    /* } */
    /* printf("\n"); */
    switch (s[i]) {
    case '+':
      stack[sp - 2] = stack[sp - 2] + stack[sp - 1];
      sp--;
      break;
    case '-':
      stack[sp - 2] = stack[sp - 2] - stack[sp - 1];
      sp--;
      break;
    case '*':
      stack[sp - 2] = stack[sp - 2] * stack[sp - 1];
      sp--;
      break;
    case '/':
      stack[sp - 2] = stack[sp - 2] / stack[sp - 1];
      sp--;
      break;
    default:
      stack[sp++] = s[i] - 48;
      break;
    }
  }

  return stack[0];
}

void solve(char *eq, int values[4], int used[4], int nop, int target) {
  /* printf("%s\n", eq); */
  int i, j, k;
  char s[10];
  if (nop == 3 && eval(eq) == target) {
    printf("%s=10\n", eq);
    return;
  }

  if (nop == 0) {
    for (i = 0; i < 4; i++) {
      used[i] = 0;
    }

    for (i = 0; i < 4; i++) {
      for (j = 0; j < 4; j++) {
        if (i == j) {
          continue;
        }
        used[i] = used[j] = 1;
        for (k = 0; k < 4; k++) {
          sprintf(s, "%d%d%c", values[i], values[j], OPs[k]);
          solve(s, values, used, nop + 1, target);
        }
        used[i] = used[j] = 0;
      }
    }
  } else {
    for (i = 0; i < 4; i++) {
      for (j = 0; j < 4; j++) {
        // select two values
        if (i == j || used[i] == 1 || used[j] == 1) {
          continue;
        }
        used[i] = used[j] = 1;
        for (k = 0; k < 4; k++) {
          sprintf(s, "%s%d%d%c", eq, values[i], values[j], OPs[k]);
          solve(s, values, used, nop + 1, target);
        }
        used[i] = used[j] = 0;
      }
      // select one values
      if (used[i] == 1) {
        continue;
      }
      used[i] = 1;
      for (k = 0; k < 4; k++) {
        sprintf(s, "%s%d%c", eq, values[i], OPs[k]);
        solve(s, values, used, nop + 1, target);
      }
      used[i] = 0;
    }
  }
}

void n2array(int *x, int n) {
  x[0] = n / 1000;
  x[1] = (n / 100) % 10;
  x[2] = (n / 10) % 10;
  x[3] = n % 10;
}

int main() {
  int x[4], i, used[4];
  for (i = 0; i < 10000; i++) {
  /* for (i = 1234; i < 10000; i++) { */
    n2array(x, i);
    solve("", x, used, 0, 10);
  }
  /* printf("%f\n", eval("43*2-1-")); */
  /* printf("%f\n", eval("99/6*4+")); */

  return EXIT_SUCCESS;
}
