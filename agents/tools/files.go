package tools

import (
	"fmt"
	"os"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// maxFileBytes caps read_file output; larger files are truncated.
const maxFileBytes = 64 * 1024

// ReadFileArgs is the input of the read_file tool.
type ReadFileArgs struct {
	// Path relative to the workspace root (absolute paths must be inside it).
	Path string `json:"path" jsonschema:"path of the file to read, relative to the workspace root"`
}

// ReadFileResult is the output of the read_file tool.
type ReadFileResult struct {
	Path      string `json:"path"`
	Content   string `json:"content"`
	Bytes     int    `json:"bytes"`
	Truncated bool   `json:"truncated,omitempty"`
}

// ListDirArgs is the input of the list_dir tool.
type ListDirArgs struct {
	// Directory path relative to the workspace root; empty lists the root.
	Path string `json:"path" jsonschema:"directory to list, relative to the workspace root"`
}

// DirEntry is one entry in a list_dir result.
type DirEntry struct {
	Name string `json:"name"`
	Kind string `json:"kind"` // "file", "dir" or "symlink"
	Size int64  `json:"size"`
}

// ListDirResult is the output of the list_dir tool.
type ListDirResult struct {
	Path    string     `json:"path"`
	Entries []DirEntry `json:"entries"`
}

// NewFilesTool returns the workspace file tools: read_file and list_dir.
// Both resolve paths against the workspace root and reject escapes.
func NewFilesTool(w Workspace) ([]tool.Tool, error) {
	read, err := functiontool.New(
		functiontool.Config{
			Name:        "read_file",
			Description: "Reads a text file inside the workspace. Files larger than 64KB are truncated to their first 64KB.",
		},
		func(ctx agent.Context, args ReadFileArgs) (ReadFileResult, error) {
			return ReadFileIn(w, args.Path)
		},
	)
	if err != nil {
		return nil, err
	}

	list, err := functiontool.New(
		functiontool.Config{
			Name:        "list_dir",
			Description: "Lists the entries of a directory inside the workspace, with file/dir kind and size. Use it to explore the projects workspace.",
		},
		func(ctx agent.Context, args ListDirArgs) (ListDirResult, error) {
			return ListDirIn(w, args.Path)
		},
	)
	if err != nil {
		return nil, err
	}
	return []tool.Tool{read, list}, nil
}

// ReadFileIn is the core of read_file, callable outside the LLM loop.
func ReadFileIn(w Workspace, pathArg string) (ReadFileResult, error) {
	path, err := w.resolve(pathArg)
	if err != nil {
		return ReadFileResult{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return ReadFileResult{}, fmt.Errorf("read %q: %w", pathArg, err)
	}
	res := ReadFileResult{Path: path, Content: string(data), Bytes: len(data)}
	if len(data) > maxFileBytes {
		res.Content = string(data[:maxFileBytes])
		res.Truncated = true
	}
	return res, nil
}

// ListDirIn is the core of list_dir, callable outside the LLM loop.
func ListDirIn(w Workspace, pathArg string) (ListDirResult, error) {
	path, err := w.resolve(pathArg)
	if err != nil {
		return ListDirResult{}, err
	}
	dirEntries, err := os.ReadDir(path)
	if err != nil {
		return ListDirResult{}, fmt.Errorf("list %q: %w", pathArg, err)
	}
	res := ListDirResult{Path: path, Entries: make([]DirEntry, 0, len(dirEntries))}
	for _, e := range dirEntries {
		entry := DirEntry{Name: e.Name()}
		switch {
		case e.Type()&os.ModeSymlink != 0:
			entry.Kind = "symlink"
		case e.IsDir():
			entry.Kind = "dir"
		default:
			entry.Kind = "file"
		}
		if info, err := e.Info(); err == nil {
			entry.Size = info.Size()
		}
		res.Entries = append(res.Entries, entry)
	}
	return res, nil
}
