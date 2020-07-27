package main

import (
	"fmt"
	"log"
	"net"
	"net/http"

	"golang.org/x/net/netutil"
)

func main() {
	l, err := net.Listen("tcp", ":8080")
	if err != nil {
		log.Fatal(err)
	}
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Hello World!")
	})
	http.Serve(netutil.LimitListener(l, 10), http.DefaultServeMux)
}
