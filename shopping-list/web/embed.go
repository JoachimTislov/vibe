// Package webui embeds the production browser bundle.
package webui

import "embed"

// Files is the frontend filesystem.
//
//go:embed index.html assets/*
var Files embed.FS
