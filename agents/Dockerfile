# Build stage: compile a static binary.
FROM golang:1.27 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/agents .

# Run stage: minimal image with a shell for the run_command tool.
FROM alpine:3.20
RUN adduser -D -u 10001 agent && mkdir -p /workspace && chown agent:agent /workspace
COPY --from=build /out/agents /usr/local/bin/agents
USER agent
ENV AGENT_WORKSPACE=/workspace
WORKDIR /workspace
EXPOSE 8080
# "api" serves the ADK REST API; "a2a" is the Agent2Agent alternative.
ENTRYPOINT ["agents"]
CMD ["api"]
