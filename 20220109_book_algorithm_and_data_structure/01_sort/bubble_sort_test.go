package sort_test

import (
	"math/rand"
	"testing"
	"time"
)

const N = 80000

func Test_BubbleSort(t *testing.T) {
	rand.Seed(time.Now().Unix())
	array := rand.Perm(N)
	BubbleSort(&array)
}

func BubbleSort(in *[]int) {
	n, tmp, i := len(*in), 0, 0
	flg := true
	for flg {
		flg = false
		for i = 0; i < n-1; i++ {
			if (*in)[i] > (*in)[i+1] {
				tmp = (*in)[i]
				(*in)[i] = (*in)[i+1]
				(*in)[i+1] = tmp
				flg = true
			}
		}
	}
}
