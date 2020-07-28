package main

import (
	"log"
	"time"

	_ "time/tzdata"
)

func main() {
	jst, err := time.LoadLocation("Asia/Tokyo")
	if err != nil {
		log.Fatal(err)
	}
	log.Println(time.Now().In(jst))
}
