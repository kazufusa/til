package main

func Sort(in []int) (ret []int) {
	if len(in) == 0 {
		return ret
	}

	_in := make([]int, len(in))
	copy(_in, in)
	for len(_in) > 0 {
		i, v := min(_in)
		ret = append(ret, v)
		_in = append(_in[:i], _in[i+1:]...)
	}
	return
}

func min(in []int) (i, v int) {
	i = 0
	v = in[i]
	for _i, _v := range in {
		if _v < v {
			v = _v
			i = _i
		}
	}
	return
}
