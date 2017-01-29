program read
  use iso_fortran_env, wp => real64

  implicit none
  character(len=100)   :: line, charval
  integer              :: intval, istat, iunit
  real(kind=kind(0D0)) :: realval, qmax
  type p_type
    character(len=100)   :: charval
    integer              :: intval
    real(kind=kind(0D0)) :: realval
  end type
  type(p_type) :: p
  ! namelist /param/ charval, intval, realval
  namelist /param/ p

  p%charval = ""
  p%realval = 0/realval
  open(newunit=iunit, file='namelist.input', status='old')
  read(iunit, nml=param, iostat=istat)
  if (istat /= 0) then
    backspace(iunit)
    read(iunit, fmt='(A)') line
    write(error_unit,'(A)') 'Invalid line in namelist: '//trim(line)
  else
    print *, trim(p%charval)
    print *, p%intval
    print *, p%realval
  endif
  close(iunit)

  open(newunit=iunit, file='test.f90', status='old')
  read(iunit, nml=param, iostat=istat)
  if (istat /= 0) then
    backspace(iunit)
    read(iunit, fmt='(A)') line
    write(error_unit,'(A)') 'Invalid line in namelist: '//trim(line)
  else
    print *, trim(p%charval)
    print *, p%intval
    print *, p%realval
  endif
  close(iunit)

  write(*, param)
end program read
