package main

import (
	"log"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type User struct {
	Id    int32
	Name  string
	Posts []Post
}

type Post struct {
	Id      int32
	Content string
	UserId  int64
}

func main() {
	dsn := "host=localhost port=5432 user=postgres password=postgres sslmode=disable"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal(err)
	}

	// MIGRATION
	err = db.AutoMigrate(&User{}, &Post{})
	if err != nil {
		log.Fatal(err)
	}

	// SELECT 1
	users := []User{}
	err = db.Find(&users).Error
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("%#+v", users)

	// INSERT
	err = db.Create(&User{Name: "hoge"}).Error
	if err != nil {
		log.Fatal(err)
	}

	// SELECT 2
	user := User{}
	err = db.Take(&user).Error
	if err != nil {
		log.Fatal(err)
	}

	// SELECT 3
	user = User{}
	posts := []Post{}
	err = db.First(&user).Error
	if err != nil {
		log.Fatal(err)
	}
	log.Println(user)
	err = db.Model(&user).Related(&posts)
	if err != nil {
		log.Fatal(err)
	}
	log.Println(posts)

	// SELECT 4
	user = User{}
	err = db.Last(&user).Error
	if err != nil {
		log.Fatal(err)
	}

	// UPDATE
	err = db.Model(&user).Update("Name", "huga").Error
	if err != nil {
		log.Fatal(err)
	}

	// DELETE
	err = db.Delete(&user).Error
	if err != nil {
		log.Fatal(err)
	}
}
