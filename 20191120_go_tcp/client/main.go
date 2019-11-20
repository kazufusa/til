package main

import (
	"bytes"
	"log"
	"net"
	"os"

	"github.com/juntaki/pp"
)

func main() {
	m := os.Args[1]

	servAddr := "localhost:8080"
	tcpAddr, err := net.ResolveTCPAddr("tcp", servAddr)
	if err != nil {
		log.Fatal(1)
	}

	conn, err := net.DialTCP("tcp", nil, tcpAddr)
	if err != nil {
		log.Fatal(1)
	}
	defer conn.Close()

	_, err = conn.Write([]byte(m))
	if err != nil {
		log.Fatal(1)
	}

	reply := make([]byte, 1024)

	_, err = conn.Read(reply)
	if err != nil {
		log.Fatal(1)
	}
	pp.Println(string(bytes.Trim(reply, "\x00")))
}
