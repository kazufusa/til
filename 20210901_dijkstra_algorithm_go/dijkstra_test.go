package dijkstra

import (
	"reflect"
	"testing"
)

var (
	graph = map[string](map[string]int){
		"start": map[string]int{"A": 6, "B": 2},
		"A":     map[string]int{"fin": 1},
		"B":     map[string]int{"A": 3, "fin": 5},
		"fin":   map[string]int{},
	}
)

func Test(t *testing.T) {
	var tests = []struct {
		expectedCost  int
		expectedRoute []string
		given         map[string](map[string]int)
		start, goal   string
	}{
		{6, []string{"start", "B", "A", "fin"}, graph, "start", "fin"},
	}
	for _, tt := range tests {
		tt := tt
		t.Run("", func(t *testing.T) {
			dijkstra := NewDijkstra(graph)
			dijkstra.Calc(tt.start, tt.goal)
			if !reflect.DeepEqual(dijkstra.Route(), tt.expectedRoute) {
				t.Error("wrong route")
			}
			if dijkstra.Cost() != tt.expectedCost {
				t.Error("wrong cost")
			}
		})
	}
}
