package main

// #include "add.c"
// #include "product.c"
import "C"

import (
	"fmt"
)

func Product(a string, c []float64) float64 {
	var ret C.double
	C.Product(C.CString(a), C.double(len(c)), (*C.double)(&c[0]), &ret)
	return float64(ret)
}

func main() {
	r1 := C.add(40, 2)
	fmt.Println("result = ", r1)

	c := []float64{1, 2, 3}
	r2 := Product("product", c)
	fmt.Println("result = ", r2)
}
