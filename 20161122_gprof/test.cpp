// http://apollon.issp.u-tokyo.ac.jp/~watanabe/pdf/tuning.pdf list. 1
//----------------------------------------------------------------------
#include <iostream>
const int N = 500;
double A[N][N];
double B[N][N];
double C[N][N];
double x[N],y[N];
//----------------------------------------------------------------------
void
init(void){
  for(int i=0;i<N;i++){
    for(int j=0;j<N;j++){
      A[i][j] = static_cast<double>(i*j);
      B[i][j] = static_cast<double>(i+j);
      C[i][j] = 0.0;
    }
    x[i] = static_cast<double>(i);
    y[i] = static_cast<double>(i);
  }
}
//----------------------------------------------------------------------
void
matmat(void){
  for(int i=0;i<N;i++){
    for(int j=0;j<N;j++){
      for(int k=0;k<N;k++){
        C[i][j] += A[i][k] * B[k][j];
      }
    }
  }
}
//----------------------------------------------------------------------
void
matvec(void){
  for(int i=0;i<N;i++){
    for(int j=0;j<N;j++){
      y[i] += C[i][j]*x[j];
    }
  }
}
//----------------------------------------------------------------------
double
vecvec(void){
double sum = 0.0;
  for(int i=0;i<N;i++){
    sum += x[i]*y[i];
  }
}
//----------------------------------------------------------------------
int
main(void){
  init();
  vecvec();
  matvec();
  matmat();
}
//----------------------------------------------------------------------
