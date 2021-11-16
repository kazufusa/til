# go and recover and logging stacktrace


```sh
$ sh ./main.sh
---------------------------
panic: main.DebugStackRecovery

goroutine 1 [running]:
runtime/debug.Stack(0x4ddec0, 0xc00000e018, 0x4c2b09)
	runtime/debug/stack.go:24 +0x9d
main.DebugStackRecovery.func1()
	command-line-arguments/main.go:29 +0xc7
panic(0x4a1b80, 0xc000010200)
	runtime/panic.go:967 +0x15d
main.Panic(0x4c9720)
	command-line-arguments/main.go:22 +0x1bf
main.main()
	command-line-arguments/main.go:12 +0x2d


---------------------------
panic: main.RuntimeCallerRecovery

command-line-arguments/main.go: 39: main.RuntimeCallerRecovery.func1
runtime/panic.go: 967: runtime.gopanic
command-line-arguments/main.go: 22: main.Panic
command-line-arguments/main.go: 13: main.main
runtime/proc.go: 203: runtime.main
runtime/asm_amd64.s: 1373: runtime.goexit

---------------------------
panic: main.RuntimeStackRecovery

goroutine 1 [running]:
main.RuntimeStackRecovery.func1()
	command-line-arguments/main.go:55 +0x14f
panic(0x4a1b80, 0xc000010310)
	runtime/panic.go:967 +0x15d
main.Panic(0x4c9740)
	command-line-arguments/main.go:22 +0x1bf
main.main()
	command-line-arguments/main.go:14 +0x4d


---------------------------
panic: main.main.func1

goroutine 1 [running]:
main.Panic(0x4c9750)
	command-line-arguments/main.go:22 +0x1bf
main.main()
	command-line-arguments/main.go:15 +0x5d
```
