gen-client:
	cd ./client && npx webpack --mode=development client.js

gen-go:
	protoc --go_out=server \
		--go_opt=paths=source_relative --go-grpc_out=server \
		--go-grpc_opt=paths=source_relative proto/helloworld/helloworld.proto

gen-js:
	protoc -I=./proto ./proto/helloworld/helloworld.proto \
		--js_out=import_style=commonjs:client/generated \
		--grpc-web_out=import_style=commonjs,mode=grpcwebtext:client/generated

up:
	docker-compose up

.PHONY: server client
