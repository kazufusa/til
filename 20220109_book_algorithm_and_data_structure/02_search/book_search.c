#include "stdio.h"
#include "stdlib.h"

#define N (5)

typedef struct {
  char *title;
  char *author;
  int bookID;
  int available; // 0: available
} book;

book *bookArray[N];

void initializeBookArray() {
  int i;
  for (i = 0; i < N; i++) {
    bookArray[i] = (book *)malloc(sizeof(book));
  }
  bookArray[0]->title = "book0";
  bookArray[1]->title = "book1";
  bookArray[2]->title = "book2";
  bookArray[3]->title = "book3";
  bookArray[4]->title = "book4";
  bookArray[0]->author = "author0";
  bookArray[1]->author = "author1";
  bookArray[2]->author = "author2";
  bookArray[3]->author = "author3";
  bookArray[4]->author = "author4";
  bookArray[0]->bookID = 1000;
  bookArray[1]->bookID = 502;
  bookArray[2]->bookID = 731;
  bookArray[3]->bookID = 628;
  bookArray[4]->bookID = 1;
  bookArray[0]->available = 1;
  bookArray[1]->available = 0;
  bookArray[2]->available = 0;
  bookArray[3]->available = 1;
  bookArray[4]->available = 1;
}

void cleanUpBookArray() {
  int i;
  for (i = 0; i < N; i++) {
    free(bookArray[i]);
  }
}

// quicksort for book array with bookID
void quickSortBookArray(book *a[], int bottom, int top) {
  int left, right;
  book *m, *tmp;
  if (top <= bottom) {
    return;
  }
  m = a[bottom];

  for (left = bottom, right = top; left <= right;) {
    while (left <= right && a[left]->bookID <= m->bookID) {
      left++;
    }
    // a[left] is lower than m
    while (left <= right && m->bookID < a[right]->bookID) {
      right--;
    }
    if (left < right) {
      tmp = a[left];
      a[left] = a[right];
      a[right] = tmp;
    }
  }
  tmp = a[bottom];
  a[bottom] = a[right];
  a[right] = tmp;
  quickSortBookArray(a, bottom, right - 1);
  quickSortBookArray(a, right + 1, top);
}

int searchBook(book *a[], int n, int key) {
  int left, right, m;
  left = 0;
  right = n - 1;
  while (left <= right) {
    m = (left + right) / 2;
    if (a[m]->bookID == key) {
      return m;
    } else if (a[m]->bookID < key) {
      left = m + 1;
    } else {
      right = m-1;
    }
  }
  return -1;
}

int main() {
  int i, r;
  initializeBookArray();
  quickSortBookArray(bookArray, 0, N - 1);

  for (i = 0; i < N; i++) {
    printf("bookID: %5d\n", bookArray[i]->bookID);
  }

  return EXIT_SUCCESS;
  while (1) {
    printf("検索する本の番号を入力してください(0で終了)\n");
    scanf("%d", &i);
    if (i == 0) {
      break;
    }
    r = searchBook(bookArray, N, i);
    if (r != -1) {
      printf("--次の本が見つかりました--\n[タイトル] %s\n[著者] %s\n[管理番号] %d\n",
          bookArray[r]->title, bookArray[r]->author, bookArray[r]->bookID);
      if (bookArray[r]->available != 0 ) {
        printf("この本は貸出可能です。\n");
      } else {
        printf("この本は貸出中です。\n");
      }
    } else {
      printf("お探しの本は見つかりませんでした\n");
    }
  }
  cleanUpBookArray();
  return EXIT_SUCCESS;
}
