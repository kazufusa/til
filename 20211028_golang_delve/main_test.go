package main

import (
	"bytes"
	"testing"
)

func TestBot(t *testing.T) {
	w := new(bytes.Buffer)
	b := Bot{w: w}
	expected := "test"
	b.Echo(expected)

	if expected != w.String() {
		t.Fatalf("'%s' is expected, but get '%s'", expected, w.String())
	}
}
