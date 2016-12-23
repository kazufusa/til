package main

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// CREATE TABLE bar (
//   id       integer,
//   date     date,
//   pref     text,
//   city     text,
//   lat      real,
//   lon      real,
//   distance real,
//   doserate real
// );
func main() {
	db, err := sql.Open("sqlite3", "./foo.db")
	checkErr(err)
	rows, err := db.Query("SELECT * FROM bar")
	checkErr(err)

	var id int
	var date time.Time
	var pref string
	var city string
	var lat float64
	var lon float64
	var distance float64
	var doserate float64
	for rows.Next() {
		err = rows.Scan(&id, &date, &pref, &city, &lat, &lon, &distance, &doserate)
		checkErr(err)
		fmt.Println(id, date, pref, city, lat, lon, distance)
	}

	db.Close()
}

func checkErr(err error) {
	if err != nil {
		panic(err)
	}
}
