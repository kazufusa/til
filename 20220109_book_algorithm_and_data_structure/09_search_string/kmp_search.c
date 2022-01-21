#include "stdio.h"
#include "stdlib.h"
#include "string.h"

#define PATTERN_LENGTH 13
unsigned char original_text[] = "a eighty-eighty-eighth key";
unsigned char original_pattern[PATTERN_LENGTH + 1] = "eighty-eighth";

unsigned char *kmp_search(unsigned char *text, unsigned char *pattern) {
  int table[PATTERN_LENGTH + 1] = {0};
  int text_index = 1;
  int pattern_index = 0;
  int i = 0, j;

  // create pattern indices
  while (pattern[text_index] != 0) {
    if (pattern[text_index] == pattern[pattern_index]) {
      table[++text_index] = ++pattern_index;
    } else if (pattern_index == 0) {
      table[++text_index] = 0;
    } else {
      pattern_index = table[pattern_index];
    }
  }

  i = 0;
  while (*text != '\0') {
    if (*text == pattern[i]) {
      text++;
      if (pattern[++i] == 0) {
        return text - PATTERN_LENGTH;
      }
    } else if (i == 0) {
      text++;
    } else {
      i = table[i];
    }
  }

  return NULL;
}

int main() {
  unsigned char *result;
  result = kmp_search(original_text, original_pattern);
  if (result == NULL) {
    printf("not found.\n");
  } else {
    printf("found: %s\n", result);
  }

  return EXIT_SUCCESS;
}
#
