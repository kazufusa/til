#include "stdio.h"
#include "stdlib.h"
#include <sys/types.h>

#define SUCCESS 0
#define FAILURE -1

typedef struct tagPATTERN {
  u_int32_t hash;
  u_int32_t prev_hash;
} PATTERN;

PATTERN *queue[2048];
int ipush = 0;
int ipop = 0;

void push(u_int32_t hash, u_int32_t prev_hash) {
  queue[ipush] = (PATTERN *)malloc(sizeof(PATTERN));
  queue[ipush]->hash = hash;
  queue[ipush]->prev_hash = prev_hash;
  ipush++;
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

u_int32_t blankPos(u_int32_t hash) {
  int i;
  for (i = 0; i < 8; i++) {
    if ((~hash & 15 << 4 * i) >> 4 * i == 15) {
      return i;
    }
  }
  return 0xfffffff;
}

u_int32_t moveV(u_int32_t hash) {
  int bp = blankPos(hash);
  int to = bp + 4;
  int mask = 15 << (4 * to);
  if (7 < to) {
    return 0xffffffff;
  }
  return (hash | ((hash & mask) >> (4 * (bp - to)))) & ~(15 << (4 * to));
}

u_int32_t moveR(u_int32_t hash) {
  int bp = blankPos(hash);
  int to = bp + 1;
  int mask = 15 << (4 * to);
  if (bp == 3 || bp == 7) {
    return 0xffffffff;
  }
  return (hash | ((hash & mask) >> (4))) & ~(15 << (4 * to));
}

u_int32_t moveL(u_int32_t hash) {
  int bp = blankPos(hash);
  int to = bp - 1;
  int mask = 15 << (4 * to);
  if (bp == 0 || bp == 4) {
    return 0xffffffff;
  }
  return (hash | ((hash & mask) << (4))) & ~(15 << (4 * to));
}

int main() {
  u_int32_t start, goal;
  goal = 0x12345670;
  start = (2 << (4 * 7)) + (7 << (4 * 6)) + (1 << (4 * 5)) + (4 << (4 * 4)) +
          (5 << (4 * 3)) + (0 << (4 * 2)) + (2 << (4 * 1)) + (6 << (4 * 0));

  bprint(start);
  printf("%d\n", blankPos(start));
  bprint(moveL(start));
  bprint(moveR(start));

  bprint(goal);
  printf("%d\n", blankPos(goal));

  cleanup();
  return EXIT_SUCCESS;
}
