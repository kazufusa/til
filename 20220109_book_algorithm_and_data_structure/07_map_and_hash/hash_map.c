#include "stdio.h"
#include "stdlib.h"
#include "string.h"

#define SUCCESS (0);
#define FAILURE (-1);

typedef struct {
  char *japanese;
  char *english;
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
  free(hashtable);
}

void PrintAllData(HASHTABLE *hashtable) {
  WORDSET *ws;
  for (int i = 0; i < hashtable->size; i++) {
    ws = hashtable->data[i];
    if (ws != NULL) {
      printf("'%s' : '%s'\n", ws->english, ws->japanese);
    }
  }
}

int AddDataFromMap(HASHTABLE *hashtable, WORDSET *ws) {
  int hash = MakeHash2(ws->english);
  if (hashtable->data[hash] != NULL) {
    hash = Rehash(hashtable, hash);
  }
  if (hash < 0) {
    return FAILURE;
  }
  hashtable->data[hash] = ws;
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

int main() {
  WORDSET *ws;
  HASHTABLE *table = (HASHTABLE *)malloc(sizeof(HASHTABLE));
  InitHashTable(table, 1000);

  ws = (WORDSET *)malloc(sizeof(ws));
  ws->english="mountain";
  ws->japanese="山";
  AddDataFromMap(table, ws);

  printf("-----SHOW ALL HASH TABLE--------\n");
  PrintAllData(table);
  printf("--------------------------------\n");
  return EXIT_SUCCESS;
}
