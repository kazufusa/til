package main

import (
	"context"
	"database/sql"
	"log"

	_ "github.com/lib/pq"
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
	ctx := context.Background()
	db, err := sql.Open(
		"postgres",
		"host=localhost port=5432 user=postgres password=postgres sslmode=disable",
	)
	if err != nil {
		log.Fatal(err)
	}

	rows, err := db.QueryContext(ctx, "select id, name from users;")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()
	users := make([]User, 0)
	for rows.Next() {
		var user User
		if err := rows.Scan(&user.Id, &user.Name); err != nil {
			log.Fatal(err)
		}
		users = append(users, user)
	}
	rerr := rows.Close()
	if rerr != nil {
		log.Fatal(rerr)
	}

	if err := rows.Err(); err != nil {
		log.Fatal(err)
	}
	log.Printf("%#+v", users)

	user := users[0]
	post := Post{Content: "test post"}
	err = db.QueryRowContext(
		ctx,
		"insert into posts (user_id, content) values ($1, $2) returning id",
		user.Id,
		post.Content,
	).Scan(&post.Id)
	if err != nil {
		log.Fatal(err)
	}

	rows, err = db.QueryContext(ctx, "select id, content from posts where user_id=$1", user.Id)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()
	posts := []Post{}
	for rows.Next() {
		var post Post
		if err := rows.Scan(&post.Id, &post.Content); err != nil {
			log.Fatal(err)
		}
		posts = append(posts, post)
	}
	rerr = rows.Close()
	if rerr != nil {
		log.Fatal(rerr)
	}

	if err := rows.Err(); err != nil {
		log.Fatal(err)
	}
	log.Printf("%#+v", posts)

	_, err = db.Exec("delete from posts where content = $1", "test post")
	if err != nil {
		log.Fatal(err)
	}
}
