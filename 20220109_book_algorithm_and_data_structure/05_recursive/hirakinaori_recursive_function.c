#include "stdio.h"
#include "stdlib.h"
#include "math.h"

u_int32_t RET[100]={};
int IRET=0;

u_int32_t mypow(int n) {
  if (n==0) {
    return 0;
  }
  return pow(n, n);
}

void evaluate(int in[10]) {
  int i, freq[10]={};
  u_int32_t n=0;
  char buf[11];

  for (i=0;i<10;i++){
    freq[in[i]] ++;
    n+=mypow(in[i]);
  }
  sprintf(buf, "%d", n);
  for (i=0;i<10;i++)
  {
    freq[buf[i]-48]--;
  }
  for (i=0;i<10;i++)
  {
    if (freq[i] != 0) {
      return ;
    }
  }
  RET[IRET++] = n;
}

int main(){
  int i;
  for (i=0;i<IRET;i++){
    printf("%d\n", RET[i]);
  }
  return EXIT_SUCCESS;
}
