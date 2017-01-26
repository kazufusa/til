program main
  implicit none
  integer :: i, j, n
  real(8), allocatable :: a(:)

  n = 100000000

  print *, size(a)

  do i=1,1000000
    allocate(a(n))
    do j=1, n
      a(j) = j/500
    end do
    call system("sleep 20")
    deallocate(a)
    call system("sleep 20")
  end do

end program main

