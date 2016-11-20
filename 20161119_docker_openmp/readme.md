# Docker and OpenMP

- host: Docker for mac(2 cores and 4 threads)
- 4 logical CPUs are assigned for Docker

## usage

```sh
$ docker-compose build
$ docker-compose up -d
$ docker-compose exec node* bash
[user@******(node*) ~]$ sh -x prime.sh
```

## result

### cpuset: 1-3 ( node2 )

|                    | omp_get_num_procs  | omp_get_max_threads  | omp_get_num_threads
|--------------------|----|----|----|
| none               | 3  | 3  | 3  |
| OMP_NUM_THREAD=1   | 3  | 1  | 1  |
| OMP_NUM_THREAD=2   | 3  | 2  | 2  |
| OMP_NUM_THREAD=3   | 3  | 3  | 3  |
| OMP_NUM_THREAD=4   | 3  | 4  | 4  |
| OMP_NUM_THREAD=5   | 3  | 5  | 5  |

### cpuset: 0 ( node1 )

|                    | omp_get_num_procs  | omp_get_max_threads  | omp_get_num_threads
|--------------------|----|----|----|
| none               | 1  | 1  | 1  |
| OMP_NUM_THREAD=1   | 1  | 1  | 1  |
| OMP_NUM_THREAD=2   | 1  | 2  | 2  |
| OMP_NUM_THREAD=3   | 1  | 3  | 3  |
| OMP_NUM_THREAD=4   | 1  | 4  | 4  |
| OMP_NUM_THREAD=5   | 1  | 5  | 5  |

### none ( node3 )

|                    | omp_get_num_procs  | omp_get_max_threads  | omp_get_num_threads
|--------------------|----|----|----|
| none               | 4  | 4  | 4  |
| OMP_NUM_THREAD=1   | 4  | 1  | 1  |
| OMP_NUM_THREAD=2   | 4  | 2  | 2  |
| OMP_NUM_THREAD=3   | 4  | 3  | 3  |
| OMP_NUM_THREAD=4   | 4  | 4  | 4  |
| OMP_NUM_THREAD=5   | 4  | 5  | 5  |
