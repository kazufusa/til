#include "stdio.h"
#include "stdlib.h"

typedef struct tagListNode {
  struct tagListNode *prev;
  struct tagListNode *next;
  int data;
} ListNode;

int main() {
  ListNode *firstnode, *lastnode, *newnode, *thisnode, *removenode;
  firstnode = lastnode = NULL;
  int i = 0;
  while (1) {
    printf("Please input the value to add, and end with 0: ");
    scanf("%d", &i);
    if (i == 0) {
      break;
    }
    newnode = malloc(sizeof(ListNode));
    newnode->data = i;
    newnode->prev = newnode->next = NULL;
    if (lastnode == NULL) {
      firstnode = lastnode = newnode;
    } else {
      lastnode->next = newnode;
      newnode->prev = lastnode;
      lastnode = newnode;
    }
  }

  i = 0;
  while (1) {
    // print out list;
    for (thisnode = firstnode; thisnode != NULL; thisnode = thisnode->next) {
      printf("%d ", thisnode->data);
    }
    printf("\n");

    printf("Please input the search value, and end with 0: ");
    scanf("%d", &i);
    if (i == 0) {
      break;
    }
    for (thisnode = firstnode; thisnode != NULL; thisnode = thisnode->next) {
      if (thisnode->data == i) {
        printf("%d is found\n", i);
        break;
      }
    }
    if (thisnode == NULL) {
      printf("%d is not found\n", i);
    } else if (thisnode != firstnode) {
      thisnode->prev->next = thisnode->next;
      if (thisnode->next != NULL) {
        thisnode->next->prev = thisnode->prev;
      }
      thisnode->prev = NULL;
      thisnode->next = firstnode;
      firstnode->prev = thisnode;
      firstnode = thisnode;
    }
  }

  // free list
  thisnode = firstnode;
  while (thisnode != NULL) {
    removenode = thisnode;
    thisnode = thisnode->next;
    free(removenode);
  }

  return EXIT_SUCCESS;
}
