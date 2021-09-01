package main

import (
	"errors"
)

type memo struct {
	name     string
	distance int
}

type Queue []memo

func (q *Queue) Push(s memo) {
	*q = append(*q, s)
}

func (q *Queue) Pop() (memo, error) {
	if len(*q) == 0 {
		return memo{}, errors.New("no newe entry")
	}
	ret := (*q)[0]
	*q = (*q)[1:]
	return ret, nil
}

type Graph map[string][]string

func NewGraph() *Graph {
	graph := make(Graph)
	graph["you"] = []string{"alice", "bob", "claire"}
	graph["claire"] = []string{"thom", "jommy"}
	graph["alice"] = []string{"peggy"}
	graph["bob"] = []string{"anuj", "peggy"}
	graph["anuj"] = nil
	graph["jonny"] = nil
	graph["peggy"] = nil
	graph["thom"] = nil

	return &graph
}

func (g *Graph) FindShortestPath(from, to string) (int, error) {
	queue := new(Queue)
	queue.Push(memo{name: from, distance: 0})
	checked := make(map[string]int)

	for {
		if err := g.Traverse(queue, checked); err != nil {
			break
		}
	}
	if ret, ok := checked[to]; ok {
		return ret, nil
	} else {
		return 0, errors.New("not found")
	}
}

func (g *Graph) Traverse(queue *Queue, checked map[string]int) error {
	from, err := queue.Pop()
	if err != nil {
		return errors.New("finished")
	}
	checked[from.name] = from.distance

	for _, v := range (*g)[from.name] {
		if _, ok := checked[v]; ok {
			continue
		}
		queue.Push(memo{name: v, distance: from.distance + 1})
	}
	return nil
}
