package dijkstra

import (
	"fmt"
	"reflect"
	"testing"
)

var (
	graph1 = map[string](map[string]int){
		"start": map[string]int{"A": 6, "B": 2},
		"A":     map[string]int{"fin": 1},
		"B":     map[string]int{"A": 3, "fin": 5},
		"fin":   map[string]int{},
	}

	graph2 = map[string](map[string]int){
		"start": map[string]int{"A": 5, "B": 2},
		"A":     map[string]int{"C": 4, "D": 2},
		"B":     map[string]int{"A": 8, "D": 7},
		"C":     map[string]int{"D": 6, "fin": 3},
		"D":     map[string]int{"fin": 1},
		"fin":   map[string]int{},
	}

	graph3 = map[string](map[string]int){
		"start": map[string]int{"A": 10},
		"A":     map[string]int{"C": 20},
		"B":     map[string]int{"A": 1},
		"C":     map[string]int{"B": 1, "fin": 30},
		"fin":   map[string]int{},
	}

	graph4 = map[string](map[string]int){
		"start": map[string]int{"A": 2, "B": 2},
		"A":     map[string]int{"C": 2, "fin": 2},
		"B":     map[string]int{"A": 2},
		"C":     map[string]int{"B": -1, "fin": 2},
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
		{6, []string{"start", "B", "A", "fin"}, graph1, "start", "fin"},
		{8, []string{"start", "A", "D", "fin"}, graph2, "start", "fin"},
		{60, []string{"start", "A", "C", "fin"}, graph3, "start", "fin"},
		{4, []string{"start", "A", "fin"}, graph4, "start", "fin"},
	}
	for _, tt := range tests {
		tt := tt
		t.Run("", func(t *testing.T) {
			dijkstra := NewDijkstra(tt.given)
			dijkstra.Calc(tt.start, tt.goal)
			if !reflect.DeepEqual(dijkstra.Route(), tt.expectedRoute) {
				t.Error("wrong route")
				fmt.Println(dijkstra.Route())
			}
			if dijkstra.Cost() != tt.expectedCost {
				t.Error("wrong cost")
				fmt.Println(dijkstra.Cost())
			}
		})
	}
}
