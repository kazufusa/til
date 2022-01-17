#include "math.h"
#include "stdio.h"
#include "stdlib.h"
#include <sys/types.h>

#define VALID (1);
#define INVALID (0);

u_int32_t RET[100] = {};
int IRET = 0;
u_int32_t EXPS[10];

void prepareEXPS() {
  EXPS[0] = 0;
  for (int i = 1; i < 10; i++) {
    EXPS[i] = pow(i, i);
  }
}

u_int32_t myPow(int i) { return EXPS[i]; }

void evaluate(int in[]) {
  int i, freq[10] = {};
  u_int32_t n = 0;
  char val[11];
  for (i = 0; i < 10; i++) {
    n += myPow(in[i]);
    freq[in[i]]++;
  }
  sprintf(val, "%010u", n);
  for (i = 0; i < 10; i++) {
    freq[val[i] - 48]--;
  }
  for (i = 1; i < 10; i++) {
    if (freq[i] != 0) {
      return;
    }
  }
  RET[IRET++] = n;
}

int main() {
  int i[10];
  int j;
  int N = 10;
  prepareEXPS();

  for (i[0] = 0; i[0] < N; i[0]++) {
    for (i[1] = i[0]; i[1] < N; i[1]++) {
      for (i[2] = i[1]; i[2] < N; i[2]++) {
        for (i[3] = i[2]; i[3] < N; i[3]++) {
          for (i[4] = i[3]; i[4] < N; i[4]++) {
            for (i[5] = i[4]; i[5] < N; i[5]++) {
              for (i[6] = i[5]; i[6] < N; i[6]++) {
                for (i[7] = i[6]; i[7] < N; i[7]++) {
                  for (i[8] = i[7]; i[8] < N; i[8]++) {
                    for (i[9] = i[8]; i[9] < N; i[9]++) {
                      evaluate(i);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  for (j = 0; j < IRET; j++) {
    printf("%d\n", RET[j]);
  }
  return EXIT_SUCCESS;
}
