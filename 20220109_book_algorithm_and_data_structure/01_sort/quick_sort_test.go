package sort_test

import (
	"math/rand"
	"testing"
	"time"
)

func Test_QuickSort(t *testing.T) {
	rand.Seed(time.Now().Unix())
	array := rand.Perm(N)
	QuickSort(&array, 0, N-1)
}

func QuickSort(in *[]int, bottom, top int) {
	if top <= bottom {
		return
	}
	m := (*in)[bottom]

	lower, upper := bottom, top
	for lower < upper {
		for lower <= upper && (*in)[lower] <= m {
			lower++
		}
		for lower <= upper && m < (*in)[upper] {
			upper--
		}
		if lower < upper {
			tmp := (*in)[lower]
			(*in)[lower] = (*in)[upper]
			(*in)[upper] = tmp
		}
	}
	tmp := (*in)[bottom]
	(*in)[bottom] = (*in)[upper]
	(*in)[upper] = tmp

	QuickSort(in, bottom, upper-1)
	QuickSort(in, upper+1, top)
}
