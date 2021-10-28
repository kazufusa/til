package main

import (
	"fmt"
	"io"
	"os"
)

type Bot struct {
	w io.Writer
}

func (b *Bot) Echo(in string) {
	fmt.Fprint(b.w, in)
}

func main() {
	bot := Bot{w: os.Stdout}
	a := os.Args[1]
	bot.Echo(a)
}
