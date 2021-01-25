package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

func UnixTimeHandler(w http.ResponseWriter, r *http.Request) {
	_, _ = w.Write([]byte(fmt.Sprintf(`{"UnixTimeStamp":%f}`, float64(time.Now().UnixNano())/1e9)))
}

func UploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "", http.StatusBadRequest)
		_, _ = w.Write([]byte("{\"success\":false}"))
		return
	}

	src, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		_, _ = w.Write([]byte("{\"success\":false}"))
		return
	}
	defer src.Close()

	name := r.FormValue("name")
	if name == "" {
		http.Error(w, "", http.StatusBadRequest)
		_, _ = w.Write([]byte("{\"success\":false}"))
		return
	}

	dst, err := os.Create(filepath.Join("uploaded", name))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		_, _ = w.Write([]byte("{\"success\":false}"))
		return
	}
	defer dst.Close()

	_, err = io.Copy(dst, src)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		_, _ = w.Write([]byte("{\"success\":false}"))
		return
	}
	log.Println(filepath.Join("uploaded", name))
	_, _ = w.Write([]byte("{\"success\":true}"))
}

func main() {
	_ = os.Mkdir("uploaded", 0777)
	http.HandleFunc("/upload", UploadHandler)
	http.HandleFunc("/unixtime", UnixTimeHandler)
	_ = http.ListenAndServe(":8080", nil)
}
