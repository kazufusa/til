package main

import (
	"errors"
	"fmt"
	"reflect"
	"runtime"
	"runtime/debug"
)

func main() {
	Panic(DebugStackRecovery)
	Panic(RuntimeCallerRecovery)
	Panic(RuntimeStackRecovery)
	Panic(func() func() { return func() {} })
}

func Panic(recovery func() func()) {
	fmt.Println("\n---------------------------")
	recoveryName := runtime.FuncForPC(reflect.ValueOf(recovery).Pointer()).Name()
	defer recovery()()
	panic(recoveryName)
}

func DebugStackRecovery() func() {
	return func() {
		if err := recover2error(recover()); err != nil {
			fmt.Printf("panic: %s\n\n", err)
			fmt.Println(string(debug.Stack()))
		}
	}
}

func RuntimeCallerRecovery() func() {
	return func() {
		if err := recover2error(recover()); err != nil {
			fmt.Printf("panic: %s\n\n", err)
			for depth := 0; ; depth++ {
				pc, file, line, ok := runtime.Caller(depth)
				if !ok {
					break
				}
				fmt.Printf("%s: %d: %s\n", file, line, runtime.FuncForPC(pc).Name())
			}
		}
	}
}

func RuntimeStackRecovery() func() {
	return func() {
		if err := recover2error(recover()); err != nil {
			fmt.Printf("panic: %s\n\n", err)
			buf := make([]byte, 1024)
			for {
				n := runtime.Stack(buf, false)
				if n < len(buf) {
					fmt.Println(string(buf[:n]))
					break
				}
				buf = make([]byte, 2*len(buf))
			}
		}
	}
}

func recover2error(r interface{}) error {
	var err error
	switch x := r.(type) {
	case nil:
		err = nil
	case string:
		err = errors.New(x)
	case error:
		err = x
	default:
		err = errors.New("unknown panic")
	}
	return err
}
