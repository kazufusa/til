package main

import (
	"testing"

	"github.com/google/go-cmp/cmp"
)

func Test(t *testing.T) {
	var tests = []struct {
		// expected   []string
		expected   int
		givenMax   int
		givenItems map[string]item
	}{
		{
			3500,
			4,
			map[string]item{
				"stereo": {4, 3000},
				"pc":     {3, 2000},
				"gutter": {1, 1500},
			}},
	}
	for _, tt := range tests {
		tt := tt
		t.Run("", func(t *testing.T) {
			actual := DP(tt.givenMax, tt.givenItems)
			if !cmp.Equal(actual, tt.expected) {
				t.Errorf(cmp.Diff(actual, tt.expected))
			}
		})
	}
}

func TestMulti(t *testing.T) {
	var tests = []struct {
		// expected   []string
		expected   int
		givenMax   int
		givenItems map[string]item
	}{
		{
			6000,
			4,
			map[string]item{
				"stereo": {4, 3000},
				"pc":     {3, 2000},
				"gutter": {1, 1500},
			}},
	}
	for _, tt := range tests {
		tt := tt
		t.Run("", func(t *testing.T) {
			actual := DPMulti(tt.givenMax, tt.givenItems)
			if !cmp.Equal(actual, tt.expected) {
				t.Errorf(cmp.Diff(actual, tt.expected))
			}
		})
	}
}
