#include "stdio.h"
#include "stdlib.h"
#include "string.h"

unsigned int MakeHash1(char *str, unsigned int hashmax) {
  unsigned int n, length, hash;
  length = strlen(str);
  for (n = hash = 0; n < length; n++) {
    hash += (int)str[n];
  }
  return hash % hashmax;
}

unsigned int MakeHash2(char *str, unsigned int hashmax) {
  unsigned int n, length, hash, weight;
  length = strlen(str);
  for (n = weight = hash = 0; n < length; n++, weight++) {
    if (7 < weight) {
      weight = 0;
    }
    hash += (int)str[n] << (4 * weight);
  }
  return hash % hashmax;
}

int main() {
  printf("# hash1\n");
  printf("%s => %d\n", "lump", MakeHash1("lump", 1000));
  printf("%s => %d\n", "plum", MakeHash1("plum", 1000));
  printf("\n# hash2\n");
  printf("%s => %d\n", "lump", MakeHash2("lump", 1000));
  printf("%s => %d\n", "plum", MakeHash2("plum", 1000));

  printf("%s => %d\n", "dawn", MakeHash2("dawn", 16));
  printf("%s => %d\n", "date", MakeHash2("date", 16));

  return EXIT_SUCCESS;
}
