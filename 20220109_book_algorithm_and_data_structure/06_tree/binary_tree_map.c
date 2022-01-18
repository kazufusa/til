#include "stdio.h"
#include "stdlib.h"
#include "string.h"

#define SUCCESS (0)
#define FAILURE (-1)

typedef struct _tagNode {
  struct _tagNode *right;
  struct _tagNode *left;
  char *key;
  char *value;
} Node;

Node *root = NULL;

Node *create_node(char *key, char *value) {
  Node *node = (Node *)malloc(sizeof(Node));
  if (node == NULL) {
    printf("メモリ不足エラーです。\n");
    exit(EXIT_FAILURE);
  }
  node->left = node->right = NULL;
  node->key = (char *)malloc(sizeof(char) * strlen(key) + 1);
  node->value = (char *)malloc(sizeof(char) * strlen(value) + 1);
  if (node->key == NULL || node->value == NULL) {
    printf("メモリ不足エラーです。\n");
    exit(EXIT_FAILURE);
  }
  strcpy(node->key, key);
  strcpy(node->value, value);
  return node;
}

void print(Node *node, int indent) {
  if (node == NULL) {
    return;
  }
  print(node->right, indent + 5);
  for (int i = 0; i < indent; i++) {
    printf(" ");
  }
  printf("[%s : %s]\n", node->key, node->value);
  print(node->left, indent + 5);
}

void insert(char *key, char *value) {
  Node *node = root, *parent;
  int direction;
  if (root == NULL) {
    root = create_node(key, value);
    return;
  }
  while (node != NULL) {
    parent = node;
    if (strcmp(node->key, key) > 0) {
      node = node->left;
      direction = 1;
    } else {
      node = node->right;
      direction = -1;
    }
  }
  if (direction == 1) {
    parent->left = create_node(key, value);
  } else {
    parent->right = create_node(key, value);
  }
}

Node *search(char *key) {
  Node *node = root;
  int cmp;
  while (node != NULL) {
    cmp = strcmp(node->key, key);
    if (cmp == 0) {
      return node;
    } else if (cmp > 0) {
      node = node->left;
    } else {
      node = node->right;
    }
  }
  return node;
}

int delete (char *key) {
  Node *node = root, *parent_node, *left_biggest_node,
       *left_biggest_node_parent;
  int direction, cmp = -1;
  char *tmp;
  while (node != NULL) {
    cmp = strcmp(node->key, key);
    if (cmp == 0) {
      break;
    } else if (0 < cmp) {
      parent_node = node;
      node = node->left;
      direction = 1;
    } else {
      parent_node = node;
      node = node->right;
      direction = -1;
    }
  }
  if (node == NULL) {
    return FAILURE;
  }

  if (node->right != NULL && node->left != NULL) {
    // If node has both left and right, move the biggest progeny in the left
    // side of the node tree to the node position.
    left_biggest_node_parent = node;
    left_biggest_node = node->left;
    while (left_biggest_node->right != NULL) {
      left_biggest_node_parent = left_biggest_node;
      left_biggest_node = left_biggest_node->right;
    }
    free(node->key);
    free(node->value);
    node->key = left_biggest_node->key;
    node->value = left_biggest_node->value;
    free(left_biggest_node);
    if (left_biggest_node_parent == node) {
      node->left = NULL;
    } else {
      left_biggest_node_parent->right = NULL;
    }
  } else {
    // If node has NULL left or NULL right, remove node and connect the parent
    // and the right or left.
    if (node->right != NULL) {
      if (parent_node == NULL) {
        root = node->right;
      } else if (direction == 1) {
        parent_node->left = node->right;
      } else {
        parent_node->right = node->right;
      }
    } else {
      if (parent_node == NULL) {
        root = node->left;
      } else if (direction == 1) {
        parent_node->left = node->left;
      } else {
        parent_node->right = node->left;
      }
    }
    free(node->key);
    free(node->value);
    free(node);
  }
  return SUCCESS;
}

void command_insert() {
  char buf[256] = {}, *key, *value;
  int i;
  printf("please input a key string\n");
  fgets(buf, 256, stdin);
  i = strlen(buf);
  key = (char *)malloc(sizeof(char) * i);
  strcpy(key, buf);
  key[i - 1] = 0;

  printf("please input a value string\n");
  fgets(buf, 256, stdin);
  i = strlen(buf);
  value = (char *)malloc(sizeof(char) * i);
  strcpy(value, buf);
  value[i - 1] = 0;

  insert(key, value);
  free(key);
  free(value);
}

void command_search() {
  Node *node;
  char buf[256] = {}, *target;
  int i;
  printf("please input search target: ");
  fgets(buf, 256, stdin);
  i = strlen(buf);
  target = (char *)malloc(sizeof(char) * i);
  strcpy(target, buf);
  target[i - 1] = 0;

  node = search(target);
  if (node != NULL) {
    printf("[%s : %s] is found\n", node->key, node->value);
  } else {
    printf("key: %s is not found\n", target);
  }

  free(target);
}

void command_delete() {
  char buf[256] = {}, *target;
  int i;
  printf("please input search target\n");
  fgets(buf, 256, stdin);
  i = strlen(buf);
  target = (char *)malloc(sizeof(char) * i);
  strcpy(target, buf);
  target[i - 1] = 0;

  delete(target);

  free(target);
}

int main() {
  char buf[256] = {};
  while (1) {
    printf("0: quit, 1: insert, 2: search, 3: delete\n");
    fgets(buf, 256, stdin);
    switch (buf[0]) {
    case '0':
      exit(EXIT_SUCCESS);
      break;
    case '1':
      command_insert();
      break;
    case '2':
      command_search();
      break;
    case '3':
      command_delete();
      break;
    }
    printf("--------------------------------\n");
    print(root, 0);
    printf("--------------------------------\n");
  }

  return EXIT_SUCCESS;
}
