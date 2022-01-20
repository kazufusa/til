#include "stdio.h"
#include "stdlib.h"

unsigned char original_text[] = "Twam Swift";
unsigned char original_pattern[] = "if";

unsigned char *simple_search(unsigned char *text, unsigned char *pattern) {
  int i;

  while (*text != '\0') {
    for (i = 0; pattern[i] != '\0'; ++i) {
      if (pattern[i] != text[i]) {
        break;
      }
    }
    if (pattern[i] == '\0') {
      return text;
    }
    ++text;
  }

  return NULL;
}

int main() {
  unsigned char *result;
  result = simple_search(original_text, original_pattern);
  if (result == NULL) {
    printf("not found.\n");
  } else {
    printf("found: %s\n", result);
  }

  return EXIT_SUCCESS;
}
