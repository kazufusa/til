#include "stdio.h"
#include "stdlib.h"

typedef struct tagListNode {
  struct tagListNode *prev;
  struct tagListNode *next;
  int data;
} ListNode;

int main() {
  ListNode *firstnode, *lastnode, *thisnode, *removenode;
  firstnode = lastnode = NULL;
  int i = 0;
  while (1) {
    printf("整数を入力してください(0を入力すると終了):");
    scanf("%d", &i);
    if (i == 0) {
      break;
    }
    thisnode = (ListNode *)malloc(sizeof(ListNode));
    thisnode->prev = thisnode->next = NULL;
    thisnode->data = i;
    if (lastnode == NULL) {
      firstnode = lastnode = thisnode;
    } else {
      lastnode->next = thisnode;
      thisnode->prev = lastnode;
      lastnode = thisnode;
    }
  }

  while (1) {
    for (thisnode = firstnode; thisnode != NULL; thisnode = thisnode->next) {
      printf("%d ", thisnode->data);
    }
    printf("\n検索する値を入力してください(0を入力すると終了):");
    scanf("%d", &i);
    if (i == 0) {
      break;
    }
    for (thisnode = firstnode; thisnode != NULL; thisnode = thisnode->next) {
      if (thisnode->data == i) {
        printf("入力された値の中に%dが見つかりました。削除します\n", i);
        if (thisnode->prev == NULL) {
          firstnode = thisnode->next;
        } else {
          thisnode->prev->next = thisnode->next;
        }
        if (thisnode->next != NULL) {
          thisnode->next->prev = thisnode->prev;
        }
        free(thisnode);
        break;
      }
    }
    printf("入力された値の中に%dが見つかりませんでした。\n", i);
  }

  // remove all nodes
  for (thisnode = firstnode; thisnode != NULL;) {
    removenode = thisnode;
    thisnode = thisnode->next;
    free(removenode);
  }
  return EXIT_SUCCESS;
}
