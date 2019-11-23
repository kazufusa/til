package main

import (
	"log"
	"net"
	"time"
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
	var ret string
	timeout := time.Second

	conn.SetReadDeadline(time.Now().Add(timeout))
	buf := make([]byte, 1)
	_, err := conn.Read(buf)
	if err != nil {
		log.Println(err)
		return
	}

	switch string(buf) {
	case "a":
		ret = "It's A"
	case "b":
		ret = "It's B"
	default:
		ret = "Unknown request"
	}
	conn.SetWriteDeadline(time.Now().Add(timeout))
	_, err = conn.Write([]byte(ret))
	if err != nil {
		log.Print(err)
	}
}
