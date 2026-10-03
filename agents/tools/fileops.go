package tools

import (
	"fmt"
	"os"
	"path/filepath"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// maxWriteBytes caps write_file content.
const maxWriteBytes = 256 * 1024

// WriteFileArgs is the input of the write_file tool.
type WriteFileArgs struct {
	Path    string `json:"path" jsonschema:"destination path inside the workspace; parent directories are created"`
	Content string `json:"content" jsonschema:"full file content to write; replaces an existing file"`
}

// WriteFileResult is the output of the write_file tool.
type WriteFileResult struct {
	Path  string `json:"path"`
	Bytes int    `json:"bytes"`
}

// DeletePathArgs is the input of the delete_path tool.
type DeletePathArgs struct {
	Path string `json:"path" jsonschema:"file or directory inside the workspace to delete recursively"`
}

// DeletePathResult is the output of the delete_path tool.
type DeletePathResult struct {
	Deleted string `json:"deleted"`
}

// NewFileOpsTool returns write_file and delete_path, both
// confirmation-gated: they mutate the workspace.
func NewFileOpsTool(w Workspace, opts Options) ([]tool.Tool, error) {
	write, err := functiontool.New(
		functiontool.Config{
			Name:                "write_file",
			Description:         "Writes a file inside the workspace, creating parent directories. Replaces existing content. Requires confirmation.",
			RequireConfirmation: !opts.AutoApprove,
		},
		func(ctx agent.Context, args WriteFileArgs) (WriteFileResult, error) {
			return WriteFileIn(w, args.Path, args.Content)
		},
	)
	if err != nil {
		return nil, err
	}
	del, err := functiontool.New(
		functiontool.Config{
			Name:                "delete_path",
			Description:         "Deletes a file or directory (recursively) inside the workspace. Cannot delete the workspace root. Requires confirmation.",
			RequireConfirmation: !opts.AutoApprove,
		},
		func(ctx agent.Context, args DeletePathArgs) (DeletePathResult, error) {
			return DeletePathIn(w, args.Path)
		},
	)
	if err != nil {
		return nil, err
	}
	return []tool.Tool{write, del}, nil
}

// WriteFileIn is the core of write_file, callable outside the LLM loop.
func WriteFileIn(w Workspace, pathArg, content string) (WriteFileResult, error) {
	if len(content) > maxWriteBytes {
		return WriteFileResult{}, fmt.Errorf("content exceeds %d bytes", maxWriteBytes)
	}
	path, err := w.resolve(pathArg)
	if err != nil {
		return WriteFileResult{}, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return WriteFileResult{}, fmt.Errorf("create parent of %q: %w", pathArg, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return WriteFileResult{}, fmt.Errorf("write %q: %w", pathArg, err)
	}
	return WriteFileResult{Path: path, Bytes: len(content)}, nil
}

// DeletePathIn is the core of delete_path, callable outside the LLM loop.
func DeletePathIn(w Workspace, pathArg string) (DeletePathResult, error) {
	path, err := w.resolve(pathArg)
	if err != nil {
		return DeletePathResult{}, err
	}
	if path == w.Root {
		return DeletePathResult{}, fmt.Errorf("refusing to delete the workspace root")
	}
	if err := os.RemoveAll(path); err != nil {
		return DeletePathResult{}, fmt.Errorf("delete %q: %w", pathArg, err)
	}
	return DeletePathResult{Deleted: path}, nil
}
