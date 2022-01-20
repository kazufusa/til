#include "float.h"
#include "stdio.h"
#include "stdlib.h"

void RoundError() {
  float f1, f2;
  f1 = 0.1f;
  f2 = 0.100000001f;
  printf("f1: 0.1 =         %20.18f\n", f1);
  printf("f2: 0.100000001 = %20.18f\n", f2);
}

void RoundError2() {
  double d1, d2;
  d1 = 0.1;
  d2 = 0.100000001;
  printf("d1: 0.1 =         %20.18f\n", d1);
  printf("d2: 0.100000001 = %20.18f\n", d2);
}

void CancellationError() {
  float f1, f2;
  f1 = 1.0000101f;
  f2 = 1.0000100f;
  printf("%15.13f + %15.13f = %15.13f\n", f1, f2, f1 + f2);
  printf("%15.13f + %15.13f = %15.13f\n", f1, f2, f1 - f2);
}

void LossOfTrailingDigit() {
  unsigned int n;
  float f1, f2;
  f1 = 10000000.0f;
  f2 = 0.0000001f;
  for (n = 0; n < 1000000; n++) {
    f1 += f2;
  }
  printf("%f\n", f1);
}

void FloatEpsilon() {
  float f1 = 1.0f;
  printf("FLT_EPSILON     = %15.13f\n", FLT_EPSILON);
  printf("1 + FLT_EPSILON = %15.13f\n", f1 + FLT_EPSILON);
  printf("1 + 0.00000009f = %15.13f\n", f1 + 0.00000009f);
}

int main() {
  printf("#RoundError\n");
  RoundError();
  printf("\n#RoundError2\n");
  RoundError2();
  printf("\n#CancellationError\n");
  CancellationError();
  printf("\n#LossOfTrailingDigit\n");
  LossOfTrailingDigit();
  printf("\n#FloatEpsilon\n");
  FloatEpsilon();
  return EXIT_SUCCESS;
}
