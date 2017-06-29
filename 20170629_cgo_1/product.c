#include <stdio.h>
#include <stddef.h>
#include <math.h>

void Product (char *a, double b, double *c, double *ret) {
  double retval;
  retval = 1;

  printf("label: %s\n", a);
  printf("size: %.0f\n", b);
  for (int i = 0; i < (int)b; i++) {
    printf("c[%i]: %.0f\n", i, c[i]);
    retval *= c[i];
  }

  *ret = retval;
}
