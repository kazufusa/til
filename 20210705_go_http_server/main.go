package main

import (
	"log"
	"net/http"
	"net/http/httputil"
)

func server1() {
	hello := func(w http.ResponseWriter, req *http.Request) {
		dump, _ := httputil.DumpRequest(req, true)
		w.Write(dump)
		// w.Write([]byte("hello world"))
	}

	http.HandleFunc("/", hello)
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Println(err)
	}
}

func main() {
	server1()
}
