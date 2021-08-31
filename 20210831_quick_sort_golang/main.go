package main

func QuickSort(in []int) []int {
	if len(in) < 2 {
		return in
	}
	var upper, lower, pivots []int
	pivot := in[0]
	for _, v := range in {
		if v > pivot {
			upper = append(upper, v)
		} else if v < pivot {
			lower = append(lower, v)
		} else {
			pivots = append(pivots, v)
		}
	}
	lower = QuickSort(lower)
	upper = QuickSort(upper)

	ret := append(lower, pivots...)
	return append(ret, upper...)
}
