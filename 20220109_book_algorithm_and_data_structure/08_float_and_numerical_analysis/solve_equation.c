#include "float.h"
#include "stdio.h"
#include "stdlib.h"

// x^5 - 10*x^4 + 25*x^3 + 40*x^2 + 200*x - 500
double func(double x) {
  return x * x * x * x * x - 10 * x * x * x * x + 25 * x * x * x + 40 * x * x +
         200 * x - 500;
}

double solveBinarySearch(double f(double)) {
  double y = 100, x, left = -1 * FLT_MAX, right = FLT_MAX, threshold = 0.00001,
         threshold2;
  threshold2 = threshold * -1;
  while (y < threshold2 || threshold < y) {
    x = (left + right) / 2;
    y = func(x);
    if (y < 0) {
      left = x;
    } else {
      right = x;
    }
  }

  return x;
}

int main() {
  double x = solveBinarySearch(func);
  printf("方程式の解は%.8f, その時のfunc(x)は%.8fです.", x, func(x));
  return EXIT_SUCCESS;
}
