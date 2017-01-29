program main
  implicit none
  integer :: i, m, n, s
  real(kind(0D0)), allocatable :: v(:, :)

  open(1, file="./fort.1", status="old")

  do
    read(1, *, iostat=s) m, n
    if (s /= 0) exit
  enddo
  print *, n, m

  rewind(1)

  allocate(v(n, m))
  do i=1, m
    read(1, *) m, n, v(:,i)
  enddo
  print *, v(:, :)
  deallocate(v)

  close(1)
end program main
