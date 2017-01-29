program read
  use iso_fortran_env, wp => real64

  implicit none
  character(len=100)   :: line, charval
  integer              :: intval, istat, iunit
  real(kind=kind(0D0)) :: realval
  namelist /param/ charval, intval, realval

  print *, "‚±‚ñ‚É‚¿‚íA¢ŠE"

  open(newunit=iunit, file='namelist.input', status='old')
  read(iunit, nml=param, iostat=istat)
  if (istat /= 0) then
    backspace(iunit)
    read(iunit, fmt='(A)') line
    write(error_unit,'(A)') 'Invalid line in namelist: '//trim(line)
  else
    print *, trim(charval)
    print *, intval
    print *, realval
  endif
  close(iunit)

  open(newunit=iunit, file='test.f90', status='old')
  read(iunit, nml=param, iostat=istat)
  if (istat /= 0) then
    backspace(iunit)
    read(iunit, fmt='(A)') line
    write(error_unit,'(A)') 'Invalid line in namelist: '//trim(line)
  else
    print *, trim(charval)
    print *, intval
    print *, realval
  endif
  close(iunit)

  write(*, param)
end program read
