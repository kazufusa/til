#include "stdio.h"
#include "stdlib.h"

#define DEFAULT_N (10)

typedef struct tagListNode {
  struct tagListNode *prev;
  struct tagListNode *next;
  int data;
} listNode;

int main() {
  listNode *firstnode, *lastnode, *newnode, *thisnode, *removenode;
  int buf, sum;
  buf = 0;
  firstnode = NULL;
  lastnode = NULL;
  while (1) {
    printf("整数を入力してください(0を入力すると終了:\n");
    scanf("%d", &buf);
    if (buf == 0) {
      break;
    }
    newnode = (listNode *)malloc(sizeof(listNode));
    newnode->data = buf;
    newnode->next = NULL;

    if (firstnode == NULL && lastnode == NULL) {
      firstnode = lastnode = newnode;
    } else {
      lastnode->next = newnode;
      lastnode = newnode;
    }
  }

  printf("入力されたのは次の数です。\n");
  for(thisnode = firstnode; thisnode != NULL;) {
    printf("%d\n", thisnode->data);
    thisnode = thisnode->next;
  }

  for(thisnode = firstnode; thisnode != NULL;) {
    removenode = thisnode;
    thisnode = thisnode->next;
    free(removenode);
  }

  return EXIT_SUCCESS;
}
