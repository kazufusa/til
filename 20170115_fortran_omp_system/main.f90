program main
  !$ use omp_lib
  implicit none
  integer :: i

  !$omp parallel
  !$omp do
  do i=1,10
    call system("sleep 2")
    print *, "Hello world!", omp_get_num_threads(), omp_get_thread_num()
  end do
  !$omp end do
  !$omp end parallel

end program main

