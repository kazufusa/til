package main

import (
	"fmt"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
)

func main() {
	app := tview.NewApplication()
	textView := tview.NewTextView().
		SetChangedFunc(func() { app.Draw() })

	textView.SetInputCapture(func(key *tcell.EventKey) *tcell.EventKey {
		// fmt.Printf("%v", tcell.KeyUp)
		fmt.Fprintf(textView, "rune: %v, key: %v\n", uint8(key.Rune()), key.Key())
		return key
	})

	if err := app.SetRoot(textView, true).EnableMouse(true).Run(); err != nil {
		panic(err)
	}
}
