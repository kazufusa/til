// Demo code for the TextView primitive.
package main

import (
	"fmt"
	"time"

	"github.com/rivo/tview"
)

func main() {
	app := tview.NewApplication()
	textView := tview.NewTextView().
		SetChangedFunc(func() { app.Draw() })

	go func() {
		for i := 0; i < 20; i++ {
			fmt.Fprintf(textView, "%s\n", "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿")
			time.Sleep(100 * time.Millisecond)
		}
		textView.Clear()
		for i := 0; i < 20; i++ {
			fmt.Fprintf(textView, "%s\n", "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿")
			time.Sleep(100 * time.Millisecond)
		}
	}()

	if err := app.SetRoot(textView, true).EnableMouse(true).Run(); err != nil {
		panic(err)
	}
}
