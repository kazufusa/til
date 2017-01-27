```
$ cat namelist.input
&param
charval   =   "Hello World"
intval    =   1
realval   =   130.1
/
$ gfortran test.f90
$ ./a.out
 Hello World
           1
   130.09999999999999
```
