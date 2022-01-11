#include "stdio.h"
#include "stdlib.h"
#include "time.h"

#define N 10 // データ件数

int sort[N];
int buffer[N];

void merge_sort(int n, int x[]) {
  int i, j, k, m;
  if (n <= 1) {
    return;
  }
  m = n / 2;
  merge_sort(m, x);
  merge_sort(n - m, x + m);

  for (i = 0; i < m; i++) {
    buffer[i] = x[i];
  }

  // i: merge1とbufferを0から舐めるindex
  // j: merge2を0から舐めるindex
  // k: マージ用index
  // m: i, kの上限, mの始点
  j = m;
  i = k = 0;
  while (i < m && j < n) {
    if (buffer[i] <= x[j]) {
      x[k++] = buffer[i++];
    } else {
      x[k++] = x[j++];
    }
  }
  // iがmに到達していない残分をx末尾に追加, 到達している場合は何もしない
  while (i<m){
    x[k++] = buffer[i++];
  }
  // また jがnに到達していない残分はもともとソートされて配置されているので, 何もしなくて良い.
}

int main() {
  int i;
  srand((unsigned int)time(NULL));

  printf("# ソート準備\n");

  for (i = 0; i < N; i++) {
    sort[i] = rand();
    printf("%10d\n", sort[i]);
  }

  printf("\n# ソート開始\n");
  merge_sort(N, sort);

  printf("\n# ソート終了\n");
  for (i = 0; i < N; i++) {
    printf("%10d\n", sort[i]);
  }
}
