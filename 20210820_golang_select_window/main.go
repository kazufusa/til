// https://github.com/immortal-autumn/go_write_netease_music_to_file/blob/54ff8e5db672d5351f84cb225cc4ffb436dfeb9d/Windows.go
package main

/**
External function:
https://blog.csdn.net/weixin_30679823/article/details/98428512
*/
import (
	"fmt"
	"os"
	"syscall"
	"unsafe"

	"github.com/juntaki/pp"
)

var (
	user32             = syscall.MustLoadDLL("user32.dll")
	procEnumWindows    = user32.MustFindProc("EnumWindows")
	procGetWindowTextW = user32.MustFindProc("GetWindowTextW")
)

func main() {
	pp.Println(GetAllWindows())
}

// Window represents any Window that is opened in the Windows OS
type Window struct {
	handle syscall.Handle
	title  string
}

// Title returns the title of the window
func (w Window) Title() string {
	return w.title
}

// GetAllWindows finds all currently opened windows
func GetAllWindows() map[int64]Window {
	m := make(map[int64]Window)
	cb := syscall.NewCallback(func(h syscall.Handle, p uintptr) uintptr {
		bytes := make([]uint16, 200)
		_, err := GetWindowText(h, &bytes[0], int32(len(bytes)))
		title := "#nil#"
		if err == nil {
			title = syscall.UTF16ToString(bytes)
		}
		m[int64(h)] = Window{h, title}
		return 1 // continue enumeration
	})
	err := EnumWindows(cb, 0)
	if err != nil {
		fmt.Println("Enum windows failed")
		os.Exit(-1)
	}
	return m
}

func EnumWindows(enumFunc uintptr, lparam uintptr) (err error) {
	r1, _, e1 := syscall.Syscall(procEnumWindows.Addr(), 2, uintptr(enumFunc), uintptr(lparam), 0)
	if r1 == 0 {
		if e1 != 0 {
			err = error(e1)
		} else {
			err = syscall.EINVAL
		}
	}
	return
}

func GetWindowText(hwnd syscall.Handle, str *uint16, maxCount int32) (len int32, err error) {
	r0, _, e1 := syscall.Syscall(procGetWindowTextW.Addr(), 3, uintptr(hwnd), uintptr(unsafe.Pointer(str)), uintptr(maxCount))
	len = int32(r0)
	if len == 0 {
		if e1 != 0 {
			err = error(e1)
		} else {
			err = syscall.EINVAL
		}
	}
	return
}
