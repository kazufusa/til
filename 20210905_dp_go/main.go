package main

type item struct {
	weight int
	value  int
}

func DP(max int, items map[string]item) int {
	values := make([][]int, len(items))
	i := 0
	for _, v := range items {
		values[i] = make([]int, max+1)
		for w := 1; w <= max; w++ {
			if v.weight > w {
				continue
			}
			if i == 0 {
				values[i][w] = v.value
			} else {
				w1 := values[i-1][w-v.weight] + v.value
				if w1 > values[i-1][w] {
					values[i][w] = w1
				} else {
					values[i][w] = values[i-1][w]
				}
			}
		}
		i++
	}
	return values[len(items)-1][max]
}

// DPMulti calculate dynamic programming with items can be selectable multi-times
func DPMulti(max int, items map[string]item) int {
	values := make([]int, max+1)
	for _, v := range items {
		for w := 0; w <= max; w++ {
			if v.weight <= w {
				w1 := values[w-v.weight] + v.value
				if w1 > values[w] {
					values[w] = w1
				}
			}
		}
	}
	return values[max]
}
