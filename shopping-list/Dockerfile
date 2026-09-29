FROM node:24-alpine AS css
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY web/styles web/styles
COPY cmd/web cmd/web
RUN npm run css

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=css /src/web/assets/app.css web/assets/app.css
RUN GOOS=js GOARCH=wasm go build -buildvcs=false -trimpath -o web/assets/app.wasm ./cmd/web && \
    cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" web/assets/wasm_exec.js && \
    CGO_ENABLED=0 go build -buildvcs=false -trimpath -ldflags='-s -w' -o /out/shopping-list ./cmd/server && \
    CGO_ENABLED=0 go build -buildvcs=false -trimpath -ldflags='-s -w' -o /out/shopping-cli ./cmd/cli

FROM alpine:3.22
RUN apk add --no-cache ca-certificates && addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=build /out/shopping-list /app/shopping-list
COPY --from=build /out/shopping-cli /app/shopping-cli
RUN mkdir /data && chown app:app /data
USER app
ENV LISTEN_ADDR=0.0.0.0:8080 DATABASE_PATH=/data/shopping.db
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["/app/shopping-list"]
