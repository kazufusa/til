#include "stdio.h"
#include "stdlib.h"
#include <sys/types.h>

#define SUCCESS 0
#define FAILURE -1

typedef struct tagPATTERN {
  u_int32_t hash;
  u_int32_t prev_hash;
} PATTERN;

PATTERN *queue[100000];
int ipush = 0;
int ipop = 0;

void push(u_int32_t hash, u_int32_t prev_hash) {
  queue[ipush] = (PATTERN *)malloc(sizeof(PATTERN));
  queue[ipush]->hash = hash;
  queue[ipush]->prev_hash = prev_hash;
  ipush++;
}

PATTERN *find(u_int32_t v) {
  int i = 0;
  while (queue[i] != NULL) {
    if (queue[i]->hash == v) {
      return queue[i];
    }
    i++;
  }
  return NULL;
}

PATTERN *pop() { return queue[ipop++]; }

void cleanup() {
  for (int i = 0; i < 2048; i++) {
    if (queue[i]) {
      free(queue[i]);
    }
  }
}

void bprint(u_int32_t v) {
  for (int i = 0; i < 32; i++) {
    if ((v >> (31 - i) & 1)) {
      printf("1");
    } else {
      printf("0");
    }
    if (i % 4 == 3) {
      printf(" ");
    }
  }
  printf("\n");
};

void print(u_int32_t v) {
  printf("┌───┬───┬───┬───┐\n│");
  for (int i = 7; i >= 4; i--) {
    printf(" %d │", (v &  15 <<(   4*i)) >>  ( 4*i));
  }
  printf("\n├───┼───┼───┼───┤\n│");
  for (int i = 3; i >= 0; i--) {
    printf(" %d │", (v &  15 <<(   4*i)) >>  ( 4*i));
  }
  printf("\n");
  printf("└───┴───┴───┴───┘\n\n");
}

u_int32_t blankPos(u_int32_t hash) {
  int i;
  for (i = 0; i < 8; i++) {
    if ((~hash & 15 << 4 * i) >> 4 * i == 15) {
      return i;
    }
  }
  return 0xfffffff;
}

u_int32_t moveUp(u_int32_t hash) {
  int bp = blankPos(hash);
  int to = bp + 4;
  int mask = 15 << (4 * to);
  if (3 < bp) {
    return 0xffffffff;
  }
  return (hash | ((hash & mask) >> (4 * 4))) & ~(15 << (4 * to));
}

u_int32_t moveDown(u_int32_t hash) {
  int bp = blankPos(hash);
  int to = bp + 4;
  int mask = 15 << (4 * to);
  if (bp < 4) {
    return 0xffffffff;
  }
  return (hash | (hash & mask) << (4 * 4)) & ~(15 << (4 * to));
}

u_int32_t moveLeft(u_int32_t hash) {
  int bp = blankPos(hash);
  int to = bp + 1;
  int mask = 15 << (4 * to);
  if (bp == 3 || bp == 7) {
    return 0xffffffff;
  }
  return (hash | ((hash & mask) >> (4))) & ~(15 << (4 * to));
}

u_int32_t moveRight(u_int32_t hash) {
  int bp = blankPos(hash);
  int to = bp - 1;
  int mask = 15 << (4 * to);
  if (bp == 0 || bp == 4) {
    return 0xffffffff;
  }
  return (hash | ((hash & mask) << (4))) & ~(15 << (4 * to));
}

PATTERN *solve(u_int32_t start, u_int32_t goal) {
  u_int32_t new_pattern;
  PATTERN *pattern;
  ipush = ipop = 0;
  push(start, 0xffffffff);
  while (1) {
    pattern = pop();
    if (pattern == NULL) {
      return NULL;
    } else if (pattern->hash == goal) {
      return pattern;
    }
    new_pattern = moveDown(pattern->hash);
    if (new_pattern != 0xffffffff && find(new_pattern) == NULL) {
      push(new_pattern, pattern->hash);
    }
    new_pattern = moveUp(pattern->hash);
    if (new_pattern != 0xffffffff && find(new_pattern) == NULL) {
      push(new_pattern, pattern->hash);
    }
    new_pattern = moveRight(pattern->hash);
    if (new_pattern != 0xffffffff && find(new_pattern) == NULL) {
      push(new_pattern, pattern->hash);
    }
    new_pattern = moveLeft(pattern->hash);
    if (new_pattern != 0xffffffff && find(new_pattern) == NULL) {
      push(new_pattern, pattern->hash);
    }
  }
}

int main() {
  u_int32_t start, goal;
  int i = 0, n = 10;
  PATTERN *ans;
  int *route;
  goal = 0x12345670;
  start = 0x27145036;
  for (int i = 0; i < 2048; i++) {
    queue[i] = NULL;
  }

  ans = solve(start, goal);
  if (ans == NULL) {
    printf("答えが見つかりませんでした.\n");
    return EXIT_FAILURE;
  }
  route = (int *)malloc(sizeof(int) * n);
  while (ans->hash != start) {
    route[i++] = ans->hash;
    ans = find(ans->prev_hash);
    if (n <= i) {
      n += 10;
      route = (int *)realloc(route, sizeof(int) * n);
    }
  }
  route[i] = start;
  for (; i >= 0; i--) {
    print(route[i]);
  }

  cleanup();
  return EXIT_SUCCESS;
}
