#include "stdio.h"
#include "stdlib.h"

#define SUCCEEDED (1);
#define FAILED (0);
#define N (10)

int queue[N];
int dequeue_point = 0;
int enqueue_point = 0;

int dequeue(int *v) {
  if (dequeue_point == enqueue_point) {
    return FAILED;
  }
  *v = queue[(dequeue_point++) % N];
  return SUCCEEDED;
}

int enqueue(int v) {
  if (enqueue_point == dequeue_point + 10) {
    return FAILED;
  }
  queue[(enqueue_point++) % N] = v;
  return SUCCEEDED;
}

void print() {
  for (int i = 0; i < N; i++) {
    printf("%d ", queue[i]);
  }
  printf("\n");
}

int main() {
  int ret, i;
  enqueue(1);
  enqueue(2);
  enqueue(3);
  enqueue(4);
  enqueue(5);
  enqueue(6);
  enqueue(7);
  enqueue(8);
  enqueue(9);
  enqueue(10);
  enqueue(11);
  enqueue(12);
  print();

  dequeue(&i);
  printf("dequeue: %d\n", i);
  enqueue(11);
  print();

  dequeue(&i);
  printf("dequeue: %d\n", i);
  dequeue(&i);
  printf("dequeue: %d\n", i);
  dequeue(&i);
  printf("dequeue: %d\n", i);
  enqueue(12);
  enqueue(13);
  enqueue(14);
  enqueue(15);
  print();
  return EXIT_SUCCESS;
}
