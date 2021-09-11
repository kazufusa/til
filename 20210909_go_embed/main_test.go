package main

import (
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
)

func Test(t *testing.T) {
	index, _ := rootFs.Open("app/build/index.html")
	expected, _ := io.ReadAll(index)

	fs := http.FS(appFs{})
	f, err := fs.Open("/nazonazo/path")
	assert.NoError(t, err)
	actual, _ := io.ReadAll(f)
	assert.Equal(t, expected, actual)
}
