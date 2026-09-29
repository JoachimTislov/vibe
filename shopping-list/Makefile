.PHONY: all generate build web css test test-e2e lint dev

all: test build

generate:
	protoc -I proto --go_out=gen --go_opt=paths=source_relative --connect-go_out=gen --connect-go_opt=paths=source_relative proto/shopping/v1/shopping.proto

css:
	npx @tailwindcss/cli -i web/styles/input.css -o web/assets/app.css --minify

web: css
	GOOS=js GOARCH=wasm go build -buildvcs=false -o web/assets/app.wasm ./cmd/web
	cp "$$(go env GOROOT)/lib/wasm/wasm_exec.js" web/assets/wasm_exec.js

build: web
	CGO_ENABLED=0 go build -buildvcs=false -trimpath -o bin/shopping-list ./cmd/server
	CGO_ENABLED=0 go build -buildvcs=false -trimpath -o bin/shopping-cli ./cmd/cli

test:
	go test ./...

test-e2e:
	go test -count=1 ./internal/e2e

lint:
	go vet ./...

dev:
	docker compose up --build
