#include "stdio.h"
#include "stdlib.h"

#define SUCCEEDED (1)
#define FAILED (0)

typedef struct tagNode {
  struct tagNode *right;
  struct tagNode *left;
  int value;
} Node;

Node *root;

int insert_node(Node *tree, Node *node) {
  Node *parent_node;
  int direction;
  if (tree == NULL || node == NULL) {
    return FAILED;
  }
  while (tree != NULL) {
    parent_node = tree;
    if (node->value < tree->value) {
      tree = tree->left;
      direction = 1;
    } else {
      tree = tree->right;
      direction = -1;
    }
  }
  if (direction == 1) {
    parent_node->left = node;
  } else {
    parent_node->right = node;
  }
  return SUCCEEDED;
}

void insert_value(Node *node, int value) {
  if (node == NULL) {
    root = (Node *)malloc(sizeof(Node));
    root->right = root->left = NULL;
    root->value = value;
  } else if (value < node->value) {
    if (node->left == NULL) {
      node->left = (Node *)malloc(sizeof(Node));
      node->left->left = node->left->right = NULL;
      node->left->value = value;
    } else {
      insert_value(node->left, value);
    }
  } else {
    if (node->right == NULL) {
      node->right = (Node *)malloc(sizeof(Node));
      node->right->left = node->right->right = NULL;
      node->right->value = value;
    } else {
      insert_value(node->right, value);
    }
  }
}

void print_node(Node *node, int indent) {
  if (node == NULL) {
    return;
  }
  print_node(node->right, indent + 4);
  for (int i = 0; i < indent; i++) {
    printf(" ");
  }
  printf("%4d\n", node->value);
  print_node(node->left, indent + 4);
}

Node *search_node(Node *node, int value) {
  if (node == NULL) {
    return NULL;
  } else if (node->value == value) {
    return node;
  } else if (value < node->value) {
    return search_node(node->left, value);
  } else {
    return search_node(node->right, value);
  }

  return NULL;
}

// delete node having value;
// return 0: failed, 1: succeeded
int delete_node(int value) {
  int direction;
  Node *parent, *node = root, *left, *right;
  while (node != NULL && node->value != value) {
    parent = node;
    if (value < node->value) {
      node = node->left;
      direction = -1;
    } else {
      node = node->right;
      direction = 1;
    }
  }
  if (node == NULL) {
    return FAILED;
  }
  if (root == node) {
    left = node->left;
    right = node->right;
    insert_node(right, left);
    root = right;
  } else {
    if (direction == -1) {
      parent->left = NULL;
    } else {
      parent->right = NULL;
    }
    insert_node(root, node->left);
    insert_node(root, node->right);
  }
  free(node);
  return SUCCEEDED;
}

void free_node(Node *node) {
  if (node == NULL) {
    return;
  }
  free_node(node->right);
  free_node(node->left);
  free(node);
}

int main() {
  Node *node = (Node *)malloc(sizeof(Node));
  node->right = node->left = NULL;
  node->value = 8;
  insert_value(root, 4);
  insert_value(root, 6);
  insert_value(root, 5);
  insert_value(root, 2);
  insert_value(root, 1);
  insert_value(root, 3);
  print_node(root, 0);
  printf("-----\n");

  insert_value(root, 1000);
  insert_node(root, node);
  print_node(root, 0);
  printf("-----\n");

  printf("1: %p\n", search_node(root, 1));
  printf("2: %p\n", search_node(root, 2));
  printf("8: %p\n", search_node(root, 8));
  printf("1000: %p\n", search_node(root, 1000));
  printf("1001: %p\n", search_node(root, 1001));

  delete_node(5);
  printf("-----\n");
  print_node(root, 0);

  delete_node(4);
  printf("-----\n");
  print_node(root, 0);

  free_node(root);
  return EXIT_SUCCESS;
}
