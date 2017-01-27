program read
  implicit none
  character(len=13) :: charval
  integer :: intval
  real(kind=kind(0D0)) :: realval
  namelist /param/ charval, intval, realval

  open(10, file='namelist.input')
  read(10, param)
  print *, charval
  print *, intval
  print *, realval
  close(10)
end program read
