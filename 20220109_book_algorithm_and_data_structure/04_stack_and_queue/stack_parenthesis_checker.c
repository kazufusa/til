#include "stdio.h"
#include "stdlib.h"

#define SUCCEEDED (1)
#define FAILED (0)

#define OPEN_SQUARE ('[')
#define CLOSE_SQUARE (']')
#define OPEN_BRACE ('{')
#define CLOSE_BRACE ('}')
#define OPEN_PARENTHESIS ('(')
#define CLOSE_PARENTHESIS (')')

typedef struct tagParenthesis {
  int type;
  struct tagParenthesis *next;
  struct tagParenthesis *prev;
} Parenthesis;

Parenthesis *stack = NULL;

void push(int b) {
  Parenthesis *new = (Parenthesis *)malloc(sizeof(Parenthesis));
  new->next = new->prev = NULL;
  new->type = b;
  if (stack == NULL) {
    stack = new;
  } else {
    stack->next = new;
    new->prev = stack;
    stack = new;
  }
}

int pop(int *ret) {
  Parenthesis *remove;
  if (stack == NULL) {
    return FAILED;
  }
  *ret = stack->type;
  remove = stack;
  stack = stack->prev;
  free(remove);
  return SUCCEEDED;
}

void freeStack() {
  Parenthesis *remove, *this;
  this = stack;
  while (this != NULL) {
    remove = this;
    this = this->prev;
    free(remove);
  }
}

int push_parenthesis(int b) {
  int ret, prev;
  switch (b) {
  case OPEN_SQUARE:
  case OPEN_BRACE:
  case OPEN_PARENTHESIS:
    push(b);
    break;
  case CLOSE_SQUARE:
    ret = pop(&prev);
    if (!ret || prev != OPEN_SQUARE) {
      return FAILED;
    }
    break;
  case CLOSE_BRACE:
    ret = pop(&prev);
    if (!ret || prev != OPEN_BRACE) {
      return FAILED;
    }
    break;
  case CLOSE_PARENTHESIS:
    ret = pop(&prev);
    if (!ret || prev != OPEN_PARENTHESIS) {
      return FAILED;
    }
    break;
  }
  return SUCCEEDED;
};

void getStart(Parenthesis *ret) {
  for (ret = stack; ret != NULL && ret->prev != NULL; ret = ret->prev) {
  }
}

void print() {
  Parenthesis *start;
  getStart(start);
  for (; start != NULL; start = start->next) {
    printf("%c", start->type);
  }
}

int main() {
  char buf[2048], *b;
  int i, ret = SUCCEEDED;
  while (1) {
    printf("\n検査する値を入力してください(0で終了)\n");
    b = fgets(buf, 2048, stdin);
    if (*b == '0') {
      break;
    }
    for (i = 0; i < 2048 && buf[i] != 0; i++) {
      switch (buf[i]) {
      case OPEN_SQUARE:
      case OPEN_BRACE:
      case OPEN_PARENTHESIS:
      case CLOSE_SQUARE:
      case CLOSE_BRACE:
      case CLOSE_PARENTHESIS:
        printf("%c", buf[i]);
        ret = push_parenthesis(buf[i]);
        break;
      }
      if (!ret) {
        break;
      }
    }
    if (!ret || stack != NULL) {
      printf("\n間違いがあります\n");
    } else {
      printf("\n正しいです\n");
    }
    freeStack();
  }
  return EXIT_SUCCESS;
}
