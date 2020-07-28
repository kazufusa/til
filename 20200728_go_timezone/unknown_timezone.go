package main

import (
	"log"
	"time"
)

func main() {
	jst, err := time.LoadLocation("Asia/Tokyo")
	if err != nil {
		log.Fatal(err)
	}
	log.Println(time.Now().In(jst))
}
