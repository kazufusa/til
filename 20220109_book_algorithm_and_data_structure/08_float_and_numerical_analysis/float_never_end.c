#include "stdio.h"
#include "stdlib.h"

void NeverEnd() {
  int n = 0;
  float f;
  for (f = 0.0; f != 5.0f; f += 0.1f) {
    printf("%d回目のループです。\n", ++n);
  }
}

int main() {
  NeverEnd();
  return EXIT_SUCCESS;
}
