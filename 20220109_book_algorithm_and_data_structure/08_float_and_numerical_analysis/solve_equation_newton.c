#include "math.h"
#include "stdio.h"
#include "stdlib.h"
#include "time.h"

// x^5 - 10*x^4 + 25*x^3 + 40*x^2 + 200*x - 500
double func(double x) {
  return x * x * x * x * x - 10 * x * x * x * x + 25 * x * x * x + 40 * x * x +
         200 * x - 500;
}

double derivativeFunc(double x) {
  return 5 * x * x * x * x - 40 * x * x * x + 75 * x * x + 80 * x + 200;
}

double solveNewton(double f(double), double df(double)) {
  double y, x, d, threshold = 0.00001, threshold2;
  threshold2 = threshold * -1;
  srand((unsigned int)time(NULL));
  x = (double)rand() * (rand() % 2 == 1 ? 1 : -1);
  for (y = 1; threshold < fabs(y);) {
    y = f(x);
    d = df(x);
    x -= y / d;
  }
  return x;
}

int main() {
  double x;
  x = solveNewton(func, derivativeFunc);
  printf("方程式の解は%.8f, その時のfunc(x)は%.8fです.\n", x, func(x));
  return EXIT_SUCCESS;
}
