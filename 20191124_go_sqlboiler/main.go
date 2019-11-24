package main

import (
	"github.com/juntaki/pp"
	"github.com/kazufusa/go_sqlboiler/models"
)

//go:generate ./bin/sqlboiler --wipe sqlite3

func main() {
	a := models.User{}
	pp.Println(a)
	a.Insert()
}
