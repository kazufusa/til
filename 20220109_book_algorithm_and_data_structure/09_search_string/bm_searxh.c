#include "stdio.h"
#include "stdlib.h"
#include "string.h"

#define PATTERN_LENGTH 4

unsigned char original_text[] =
    "On a dark desert highway, cool wind in my hair,";
unsigned char original_pattern[] = "wind";

unsigned char *bm_search(unsigned char *text, unsigned char *pattern) {
  int shift[256];
  int text_index, pattern_index, text_len, i;

  for (i = 0; i < 256; i++) {
    shift[i] = PATTERN_LENGTH;
  }
  for (i = 0; i < PATTERN_LENGTH; i++) {
    shift[pattern[i]] = PATTERN_LENGTH - i - 1;
  }

  for (text_len = 0; text[text_len] != 0; text_len++) {
  }

  text_index = PATTERN_LENGTH - 1;

  while (text_index < text_len) {
    pattern_index = PATTERN_LENGTH - 1;
    while (text[text_index] == pattern[pattern_index]) {
      if (pattern_index == 0) {
        return text + text_index;
      }
      text_index--;
      pattern_index--;
    }

    if (PATTERN_LENGTH - pattern_index < shift[text[text_index]]) {
      text_index += shift[text[text_index]];
    } else {
      text_index += PATTERN_LENGTH - pattern_index;
    }
  }

  return NULL;
}

int main() {
  unsigned char *result;
  result = bm_search(original_text, original_pattern);
  if (result == NULL) {
    printf("not found.\n");
  } else {
    printf("found: %s\n", result);
  }

  return EXIT_SUCCESS;
}
#
