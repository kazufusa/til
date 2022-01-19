#include "stdio.h"
#include "stdlib.h"
#include "string.h"

#define SUCCESS 0
#define FAILURE -1

typedef struct {
  char *english;
  char *japanese;
} WORDSET;

typedef struct {
  WORDSET **data;
  unsigned int size;
} HASHTABLE;

// hash is same to MakeHash2
int MakeHash2(char *str) {
  int l, i, hash, weight;
  l = strlen(str);
  for (i = hash = weight = 0; i < l; i++, weight++) {
    if (7 < weight) {
      weight = 0;
    }
    hash += (int)str[i] << (4 * weight);
  }
  return hash;
}

int Rehash(HASHTABLE *hashtable, unsigned int firsthash) {
  int secondhash, k;
  for (k = 1; k <= hashtable->size / 2; k++) {
    secondhash = (firsthash + k * k) % hashtable->size;
    if (hashtable->data[secondhash] == NULL) {
      return secondhash;
    }
  }
  return -1;
}

void InitHashTable(HASHTABLE *hashtable, unsigned int size) {
  hashtable->data = (WORDSET **)malloc(sizeof(WORDSET) * size);
  if (hashtable->data) {
    for (int i = 0; i < size; i++) {
      hashtable->data[i] = NULL;
    }
    hashtable->size = size;
  }
}

void CleanUpHashTable(HASHTABLE *hashtable) {
  for (int i = 0; i < hashtable->size; i++) {
    free(hashtable->data[i]);
  }
  free(hashtable->data);
}

void PrintAllData(HASHTABLE *hashtable) {
  WORDSET *ws;
  for (int i = 0; i < hashtable->size; i++) {
    ws = hashtable->data[i];
    if (ws != NULL) {
      printf("(%d) '%s' : '%s'\n", i, ws->english, ws->japanese);
    }
  }
}

int AddDataFromMap(HASHTABLE *hashtable, WORDSET *ws) {
  int hash = MakeHash2(ws->english) % hashtable->size;
  if (hashtable->data[hash] != NULL) {
    hash = Rehash(hashtable, hash);
  }
  if (hash < 0) {
    return FAILURE;
  }
  hashtable->data[hash] = (WORDSET *)malloc(sizeof(WORDSET));
  hashtable->data[hash]->english = (char *)malloc(sizeof(char) * strlen(ws->english));
  hashtable->data[hash]->japanese = (char *)malloc(sizeof(char) * strlen(ws->japanese));
  strcpy(hashtable->data[hash]->english, ws->english);

  return SUCCESS;
}

char *GetDataFromMap(HASHTABLE *hashtable, char *key) {
  WORDSET *ws;
  int hash = MakeHash2(key);
  while (hash != -1) {
    ws = hashtable->data[hash];
    if (ws != NULL && ws->english == key) {
      return ws->japanese;
    }
    hash = Rehash(hashtable, hash);
  }
  return NULL;
}

void DeleteDataFromMap(HASHTABLE *hashtable, char *key) {
  WORDSET *ws;
  int hash = MakeHash2(key);
  while (hash != -1) {
    ws = hashtable->data[hash];
    if (ws != NULL && ws->english == key) {
      break;
    }
    hash = Rehash(hashtable, hash);
  }
  if (ws != NULL) {
    hashtable->data[hash] = NULL;
    free(ws);
  }
}

void CommandInsert(HASHTABLE * table){
  char japanese[256], english[256];
  WORDSET ws;
  int ret;

  printf("キーを入力してください\n");
  scanf("%s", english);
  printf("値を入力してください\n");
  scanf("%s", japanese);

  ws.japanese = japanese;
  ws.english = english;
  ret = AddDataFromMap(table, &ws);
  if (ret == SUCCESS) {
    printf("追加しました\n");
  }
}

void CommandDelete(HASHTABLE*table){
}

int main() {
  HASHTABLE table;
  InitHashTable(&table, 503);
  WORDSET initialWs[5] = {
    {"dolphin", "イルカ"}, {"beluga", "シロイルカ"},
    {"grampus", "シャチ"}, {"medusa", "海月"},
    {"otter", "カワウソ"},
  };
  int n =1;

  for (int i = 0; i < 5; i++) {
    AddDataFromMap(&table, &initialWs[i]);
  }

  while(n!=0) {
    printf("どの操作を行いますか? 0: 終了, 1: 追加, 2: 検索, 3: 削除, 4: 全表示\n");
    scanf("%d", &n);
    switch (n) {
      case 1:
        CommandInsert(&table);
        break;
      case 2:
        CommandDelete(&table);
        break;
      case 3:
        printf("-----SHOW HASH TABLE--------\n");
        PrintAllData(&table);
        printf("--------------------------------\n");
        break;
    }
  }

  CleanUpHashTable(&table);
  return EXIT_SUCCESS;
}
