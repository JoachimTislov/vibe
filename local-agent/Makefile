.PHONY: proto build test test-unit test-e2e test-upstream run tidy check fmt vet

# Requires protoc + protoc-gen-go + protoc-gen-go-grpc on PATH.
# Install once: go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
#               go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
proto:
	protoc --go_out=. --go_opt=module=github.com/YOURNAME/agentic-gateway \
		--go-grpc_out=. --go-grpc_opt=module=github.com/YOURNAME/agentic-gateway proto/core/v1/core.proto

tidy:
	go mod tidy

build:
	go build -o bin/ ./cmd/coreserver ./cmd/agent ./cmd/adapters/slack ./cmd/adapters/telegram ./cmd/adapters/mcp

# Generated protobuf sources are checked in; regeneration is explicit.
test-unit:
	go test -race ./test/unit/... ./internal/... ./pkg/...

# Requires Neovim. External accounts/model services are replaced by fixtures.
test-e2e:
	go test -race -count=1 ./test/e2e/...

# AGENT_SLACK_CLI must name an unmodified official slackapi/slack-cli binary.
# Uses local HTTPS fixtures, never an account token or real platform messages.
test-upstream:
	go test -race -tags upstream -run TestOfficialSlackCLIEntrypoint -count=1 -timeout 120s ./test/e2e

test:
	go test -race ./...

fmt:
	go fmt ./...

vet:
	go vet ./...

check: vet test

run:
	go run ./cmd/coreserver
