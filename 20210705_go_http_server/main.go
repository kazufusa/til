package main

import (
	"log"
	"net/http"
)

func server1() {
	hello := func(w http.ResponseWriter, req *http.Request) {
		w.Write([]byte("hello world"))
	}

	http.HandleFunc("/", hello)
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Println(err)
	}
}
