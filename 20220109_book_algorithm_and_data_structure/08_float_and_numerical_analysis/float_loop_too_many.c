#include "stdio.h"
#include "stdlib.h"

void TooManyLoop() {
  int n = 0;
  float f;
  for (f = 0.0; f < 5.0f; f += 0.1f) {
    printf("%3d回目のループです: f=%20.18f\n", ++n, f);
  }
}

void FixedLoop() {
  int n = 0;
  float f;
  for (n = 0; n <= 50; n++) {
    f = 0.1f * n;
    printf("%3d回目のループです: f=%20.18f\n", n, f);
  }
}

int main() {
  TooManyLoop();
  FixedLoop();
  return EXIT_SUCCESS;
}
