package main

import (
	"embed"
	_ "embed"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
)

//go:embed app/build
var rootFs embed.FS

type appFs struct {
	content embed.FS
}

func (fs appFs) Open(name string) (fs.File, error) {
	f, err := rootFs.Open(filepath.Join("app", "build", name))
	if os.IsNotExist(err) {
		return rootFs.Open("app/build/index.html")
	}
	return f, err
}

func main() {
	http.Handle("/", http.FileServer(http.FS(appFs{})))
	http.ListenAndServe(":8080", nil)
}
