package main

import (
	"fmt"
	"reflect"
	"testing"
)

func TestSort(t *testing.T) {
	var tests = []struct {
		expected []int
		given    []int
	}{
		{[]int{1, 2, 3, 4, 5}, []int{4, 2, 3, 5, 1}},
		{[]int{1, 2, 3, 4, 5}, []int{1, 2, 3, 4, 5}},
		{[]int{1, 1, 3, 4, 5}, []int{1, 5, 4, 1, 3}},
		{[]int{}, []int{}},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(fmt.Sprintf("%v", tt.given), func(t *testing.T) {
			actual := Sort(tt.given)
			if !reflect.DeepEqual(actual, tt.expected) {
				t.Errorf("given(%v): expected %v, actual %v", tt.given, tt.expected, actual)
			}
		})
	}
}
