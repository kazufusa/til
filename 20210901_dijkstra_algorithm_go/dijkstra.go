package dijkstra

import (
	"math"
)

type Dijkstra struct {
	graph     map[string]map[string]int
	cost      map[string]int
	parent    map[string]string
	proceeded []string

	start, goal string
}

func NewDijkstra(graph map[string]map[string]int) Dijkstra {
	return Dijkstra{graph: graph}
}

func (d *Dijkstra) Calc(start, goal string) {
	d.start, d.goal = start, goal
	d.prepare()

	for {
		var node string
		if node = d.findLowestCostNode(); node == goal {
			break
		}
		for k, v := range d.graph[node] {
			if d.cost[node]+v < d.cost[k] {
				d.cost[k] = d.cost[node] + v
				d.parent[k] = node
			}
		}
		d.proceeded = append(d.proceeded, node)
	}
}

func (d *Dijkstra) Route() []string {
	ret := []string{d.goal}
	for i := 0; i < 10; i++ {
		ret = append([]string{d.parent[ret[0]]}, ret...)
		if ret[0] == d.start {
			break
		}
	}
	return ret
}

func (d *Dijkstra) Cost() int {
	return d.cost[d.goal]
}

func (d *Dijkstra) prepare() {
	d.cost = make(map[string]int)
	d.parent = make(map[string]string)
	d.proceeded = []string{}

	for k, v := range d.graph {
		if k == d.start {
			for kk, vv := range v {
				d.cost[kk] = vv
				d.parent[kk] = d.start
			}
		} else if _, ok := d.cost[k]; !ok {
			d.cost[k] = math.MaxInt64
		}
	}
}

func (d *Dijkstra) findLowestCostNode() string {
	_v := math.MaxInt64
	var ret string
L:
	for k, v := range d.cost {
		for _, p := range d.proceeded {
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
