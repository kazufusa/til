package main

import (
	"fmt"
	"math"
)

func main() {
	graph := make(map[string](map[string]int))
	graph["start"] = map[string]int{"A": 6, "B": 2}
	graph["A"] = map[string]int{"fin": 1}
	graph["B"] = map[string]int{"A": 3, "fin": 5}
	graph["fin"] = map[string]int{}

	cost := map[string]int{"A": 6, "B": 2, "fin": math.MaxInt64}

	parent := map[string]string{"A": "start", "B": "start", "fin": ""}

	proceeded := []string{}

	to := "fin"

	for {
		var node string
		if node = findLowestCostNode(graph, cost, parent, proceeded); node == to {
			break
		}
		for k, v := range graph[node] {
			if cost[node]+v < cost[k] {
				cost[k] = cost[node] + v
				parent[k] = node
			}
		}
		proceeded = append(proceeded, node)
	}
	fmt.Printf("Minimum cost from start to %s is %d", to, cost[to])
}

func findLowestCostNode(
	graph map[string](map[string]int),
	cost map[string]int,
	parent map[string]string,
	proceeded []string,
) string {
	_v := math.MaxInt64
	var ret string
L:
	for k, v := range cost {
		for _, p := range proceeded {
			if k == p {
				continue L
			}
		}
		if v < _v {
			_v = v
			ret = k
		}
	}
	return ret
}
