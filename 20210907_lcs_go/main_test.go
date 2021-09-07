package main

import (
	"fmt"
	"testing"
)

func Test(t *testing.T) {
	var tests = []struct {
		expected int
		given    [2]string
	}{
		{3, [2]string{"hish", "fish"}},
		{2, [2]string{"hish", "dash"}},
		{3, [2]string{"fosh", "fish"}},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(fmt.Sprintf("%v", tt.given), func(t *testing.T) {
			actual := LCS(tt.given[0], tt.given[1])
			if actual != tt.expected {
				t.Errorf("given(%s): expected %d, actual %d", tt.given, tt.expected, actual)
			}
		})
	}
}
