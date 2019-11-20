package main

import (
	"log"
	"net"

	"github.com/juntaki/pp"
)

func main() {
	l, err := net.Listen("tcp", ":8080")
	if err != nil {
		log.Fatal(err)
	}
	defer l.Close()

	for {
		conn, err := l.Accept()
		if err != nil {
			log.Fatal(err)
		}

		go handleConn(conn)
	}
}

func handleConn(conn net.Conn) {
	defer conn.Close()
	conn.Write([]byte("Hello"))

	buf := make([]byte, 1)
	_, err := conn.Read(buf)
	if err != nil {
		log.Println(err)
		return
	}
	pp.Println(buf)
	pp.Println(string(buf))
	switch string(buf) {
	case "a":
		conn.Write([]byte("It's A"))
	case "b":
		conn.Write([]byte("It's B"))
	default:
		conn.Write([]byte("Unknown request"))
	}
}
