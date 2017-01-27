program main
  implicit none
  character(len=512)  :: line, tag
  integer             :: score

  open(10, file="test.txt", status="old")

  ! seek target block
  do
    read(10, "(A100)") line
    if (trim(line) == "�X�R�A�ꗗ") then
      exit
    endif
  enddo
  read(10, "(A100)") line

  ! parse target block
  do
    read(10, "(A100)") line
    if (trim(line) == "���l" .or. trim(line) == "") then
      exit
    endif
    read(line, *) tag, score
    select case (tag)
       case ("�c��")
         print *, "Tanaka", score
       case ("�R�c")
         print *, "Yamada", score
       case ("�����͓���")
         print *, "Samuragochi", score
       case default
    end select
  enddo

  close(10)
end program main
