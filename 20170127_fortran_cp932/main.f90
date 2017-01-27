program main
  implicit none
  character(len=512)  :: line, tag
  integer             :: score

  open(10, file="test.txt", status="old")

  ! seek target block
  do
    read(10, "(A100)") line
    if (trim(line) == "スコア一覧") then
      exit
    endif
  enddo
  read(10, "(A100)") line

  ! parse target block
  do
    read(10, "(A100)") line
    if (trim(line) == "備考" .or. trim(line) == "") then
      exit
    endif
    read(line, *) tag, score
    select case (tag)
       case ("田中")
         print *, "Tanaka", score
       case ("山田")
         print *, "Yamada", score
       case ("佐村河内守")
         print *, "Samuragochi", score
       case default
    end select
  enddo

  close(10)
end program main
