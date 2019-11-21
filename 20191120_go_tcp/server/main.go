package main

import (
	"log"
	"net"
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

	buf := make([]byte, 1)
	_, err := conn.Read(buf)
	if err != nil {
		log.Println(err)
		return
	}
	switch string(buf) {
	case "a":
		_, err = conn.Write([]byte("It's A"))
	case "b":
		_, err = conn.Write([]byte("It's B"))
	default:
		_, err = conn.Write([]byte("Unknown request"))
	}
	if err != nil {
		log.Print(err)
	}
}
