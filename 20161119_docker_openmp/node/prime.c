//http://stackoverflow.com/questions/9244481/how-to-get-100-cpu-usage-from-a-c-program#answer-9244560
#include <stdio.h>
#include <time.h>
#include <omp.h>
#include <math.h>

int main() {
    double start, end;
    double runTime;
    start = omp_get_wtime();
    int num = 1,primes = 0;

    int limit = 100000;
    int num_threads = 0;

    printf("omp_get_num_procs: %d\n", omp_get_num_procs());
    printf("omp_get_max_threads: %d\n", omp_get_max_threads());
#pragma omp parallel
    {
        printf("omp_get_num_threads: %d\n", omp_get_num_threads());
#pragma omp for schedule(dynamic) reduction(+ : primes)
        for (num = 1; num <= limit; num++) {
            if (num_threads < omp_get_thread_num()) num_threads = omp_get_thread_num();
            int i = 2;
            while(i <= num) {
                if(num % i == 0)
                    break;
                i++;
            }
            if(i == num)
                primes++;
    //      printf("%d prime numbers calculated\n",primes);
        }
    }

    end = omp_get_wtime();
    runTime = end - start;
    printf("This machine calculated all %d prime numbers under %d in %g seconds\n",primes,limit,runTime);

    return 0;
}
