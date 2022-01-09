package sort_test

import (
	"math/rand"
	"testing"
	"time"
)

func Test_MergeSort(t *testing.T) {
	rand.Seed(time.Now().Unix())
	array := rand.Perm(N)
	array = MergeSort(array)
}

func MergeSort(in []int) (ret []int) {
	n := len(in)
	if n <= 1 {
		return in
	}
	m := n / 2
	left := MergeSort(in[0:m])
	right := MergeSort(in[m:n])
	i, j := 0, 0
	for {
		if left[i] < right[j] {
			ret = append(ret, left[i])
			if i == len(left)-1 {
				ret = append(ret, right[j:]...)
				break
			} else {
				i++
			}
		} else {
			ret = append(ret, right[j])
			if j == len(right)-1 {
				ret = append(ret, left[i:]...)
				break
			} else {
				j++
			}
		}
	}

	return in
}
