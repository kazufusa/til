package main

import (
	"fmt"
	"io"
	"log"
	"net"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatal("argument count mismatch error")
	}
	m := os.Args[1]

	servAddr := "localhost:8080"
	tcpAddr, err := net.ResolveTCPAddr("tcp", servAddr)
	if err != nil {
		log.Fatal(err)
	}

	conn, err := net.DialTCP("tcp", nil, tcpAddr)
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()

	_, err = conn.Write([]byte(m))
	if err != nil {
		log.Fatal(err)
	}

	buf := make([]byte, 1024)

	for {
		n, err := conn.Read(buf)
		if err == io.EOF {
			log.Print(err)
			break
		} else if err != nil {
			log.Fatal(err)
		}
		reply := buf[:n]
		fmt.Println(string(reply))
	}
}
