package main

import (
	"database/sql"
	"log"

	_ "github.com/lib/pq"
	"gopkg.in/gorp.v1"
)

type User struct {
	Id   int64
	Name string
}

type Post struct {
	Id      int64
	Content string
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	db, err := sql.Open(
		"postgres",
		"host=localhost port=5432 user=postgres password=postgres sslmode=disable",
	)
	if err != nil {
		log.Fatal(err)
	}

	// construct a gorp DbMap
	dbmap := &gorp.DbMap{Db: db, Dialect: gorp.SqliteDialect{}}

	// add a table, setting the table name to 'users' and 'posts', and
	// specifying that the Id property is a non-auto incrementing PK
	dbmap.AddTableWithName(User{}, "users").SetKeys(false, "Id")
	dbmap.AddTableWithName(Post{}, "posts").SetKeys(false, "Id")

	// create the table. in a production system you'd generally
	// use a migration tool, or create the tables via scripts
	err = dbmap.CreateTablesIfNotExists()
	if err != nil {
		log.Fatal(err)
	}

	// SELECT
	var users []User
	_, err = dbmap.Select(&users, "select * from users")
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("%#+v", users)
}
