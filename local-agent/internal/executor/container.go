package executor

import (
	"context"
	"errors"
)

// ContainerExecutor runs a task inside a container. Scaffolded as a stub:
// wire this up to github.com/docker/docker/client (the official Docker
// Engine API client) per ARCHITECTURE.md before this tier is load-bearing.
// Consider a gVisor (runsc) runtime here if this tier ever runs
// less-trusted code than it does today.
type ContainerExecutor struct {
	Image string // container image to run tasks in; set at construction
}

func NewContainerExecutor(image string) *ContainerExecutor {
	return &ContainerExecutor{Image: image}
}

func (c *ContainerExecutor) Tier() Tier { return TierContainer }

func (c *ContainerExecutor) Run(ctx context.Context, task Task) (Result, error) {
	// TODO: docker/docker client — create container from c.Image, mount
	// whatever scoped workspace the task needs, run task.Command/Args
	// inside it, capture stdout/stderr, tear the container down.
	return Result{}, errors.New("executor: container tier not implemented yet")
}
