package main

import (
	"log"
	"net/http"
)

var (
	helloHandlerFunc = func(w http.ResponseWriter, req *http.Request) {
		w.Write([]byte("hello world"))
	}
)

type helloHandler struct{}

func (h *helloHandler) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	w.Write([]byte("hello world"))
}

// handleFuncを使う
func server1() {
	http.HandleFunc("/hello", helloHandlerFunc)
	if err := http.ListenAndServe(":8000", nil); err != nil {
		log.Println(err)
	}
}

// handleFuncをhttp.HandlerFuncに変換して使う
func server2() {
	http.Handle("/hello", http.HandlerFunc(helloHandlerFunc))
	if err := http.ListenAndServe(":8010", nil); err != nil {
		log.Println(err)
	}
}

// http.Handlerを使う
func server3() {
	http.Handle("/hello", &helloHandler{})
	if err := http.ListenAndServe(":8010", nil); err != nil {
		log.Println(err)
	}
}

// http.Handlerをhttp.Server構造体から使う
// routingはできない
func server4() {
	server := &http.Server{Addr: ":8020", Handler: &helloHandler{}}
	if err := server.ListenAndServe(); err != nil {
		log.Println(err)
	}
}

// http.Handlerをhttp.ServeMux経由でhttp.Server構造体から使う
// routingできる
func server5() {
	mux := http.NewServeMux()
	mux.Handle("/hello", &helloHandler{})
	server := &http.Server{Addr: ":8030", Handler: mux}
	if err := server.ListenAndServe(); err != nil {
		log.Println(err)
	}
}

func main() {
	server2()
}
