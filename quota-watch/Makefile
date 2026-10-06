.PHONY: build run demo test lint

build:
	go build -o quota-watch ./cmd/quota-watch

run:
	go run ./cmd/quota-watch

demo:
	go run ./cmd/quota-watch --demo

test:
	go test ./...

lint:
	go vet ./...
