init:
	docker run --name postgresql-container -p 5432:5432 --rm -e POSTGRES_PASSWORD=password -d postgres

down:
	docker stop postgresql-container

con:
	PGPASSWORD=postgres psql -h localhost -U postgres -d postgres

build:
	docker build --progress=plain -t deno-cloudrun:latest .

run:
	docker run --rm \
		-e DB_NAME=postgres \
		-e DB_USER=postgres \
		-e DB_HOST=172.24.238.201 \
		-e DB_PORT=5432 \
		-e DB_PASSWORD=password \
		-e TASK=B \
		deno-cloudrun:latest
