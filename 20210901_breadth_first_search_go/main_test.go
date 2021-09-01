package main

import (
	"fmt"
	"testing"
)

func Test(t *testing.T) {
	graph := NewGraph()

	var tests = []struct {
		expected    int
		expectedErr bool
		givenFrom   string
		givenTo     string
	}{
		{2, false, "you", "anuj"},
		{1, false, "you", "claire"},
		{1, false, "you", "alice"},
		{0, true, "you", "sunny"},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(fmt.Sprintf("%s to %s", tt.givenFrom, tt.givenTo), func(t *testing.T) {
			actual, err := graph.FindShortestPath(tt.givenFrom, tt.givenTo)
			if tt.expectedErr && err == nil {
				t.Errorf("given(%s to %s): should return error, but target is found", tt.givenFrom, tt.givenTo)
			}
			if actual != tt.expected {
				t.Errorf("given(%s to %s): expected %d, actual %d", tt.givenFrom, tt.givenTo, tt.expected, actual)
			}
		})
	}
}
