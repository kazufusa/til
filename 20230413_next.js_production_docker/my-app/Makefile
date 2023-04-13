build:
	yarn
	yarn build
	docker image build -t next .

run:
	docker container run --rm -p 3001:3000 next
