package main

func LCS(a, b string) int {
	t := make([][]int, len(a))
	var ret int = 0
	for ia, ra := range a {
		t[ia] = make([]int, len(b))
		for ib, rb := range b {
			if ra == rb {
				if ia == 0 || ib == 0 {
					t[ia][ib] = 1
				} else {
					t[ia][ib] = t[ia-1][ib-1] + 1
				}
			} else {
				if ia == 0 && ib == 0 {
					t[ia][ib] = 0
				} else if ib == 0 {
					t[ia][ib] = t[ia-1][ib]
				} else {
					t[ia][ib] = t[ia][ib-1]
				}
			}
			if t[ia][ib] > ret {
				ret = t[ia][ib]
			}
		}
	}

	return ret
}
