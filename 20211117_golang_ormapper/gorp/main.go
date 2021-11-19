package main

import (
	"database/sql"
	"log"

	_ "github.com/lib/pq"
	"gopkg.in/gorp.v2"
)

type User struct {
	Id      int64  `db:"id"`
	Name    string `db:"name"`
	Version int64  `db:"version"`
}

type Post struct {
	Id      int64  `db:"id"`
	Content string `db:"content"`
	UserId  int64  `db:"user_id"`
	Version int64  `db:"version"`
}

type User2 struct {
	Id    int64  `db:"id"`
	Name  string `db:"name"`
	Posts []Post `db:"-,fkey=posts"`
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
	defer db.Close()

	// construct a gorp DbMap
	dbmap := &gorp.DbMap{Db: db, Dialect: gorp.PostgresDialect{}}

	// add a table, setting the table name to 'users' and 'posts', and
	// specifying that the Id property is a non-auto incrementing PK
	dbmap.AddTableWithName(User{}, "users").SetKeys(true, "Id").SetVersionCol("version")
	dbmap.AddTableWithName(Post{}, "posts").SetKeys(true, "Id").SetVersionCol("version")

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

	var posts []Post
	_, err = dbmap.Select(&posts, "select * from posts")
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("%#+v", posts)

	// TODO SELECT with INNER JOIN

	// INSERT
	p1 := &Post{Content: "ttest content", UserId: users[0].Id}
	err = dbmap.Insert(p1)
	if err != nil {
		log.Fatal(err)
	}
	log.Println(p1)

	// UPDATE
	// optimistic-locking(https: //github.com/go-gorp/gorp#optimistic-locking)
	obj, err := dbmap.Get(Post{}, p1.Id)
	if err != nil {
		log.Fatal(err)
	}
	p2 := obj.(*Post)
	p2.Content = "tttest post"
	_, err = dbmap.Update(p2)
	if err != nil {
		log.Fatal(err)
	}
	log.Println(p2)

	p1.Content = "test post"
	_, err = dbmap.Update(p1)
	_, ok := err.(gorp.OptimisticLockError)
	if ok {
		log.Printf("Tried to update row with stale data: %v\n", err)
	} else {
		log.Fatalf("Unknown db error: %v\n", err)
	}

	// DELETE
	_, err = db.Exec("delete from posts where content = $1", "test post")
	if err != nil {
		log.Fatal(err)
	}
}
