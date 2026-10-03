package tools

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// procRegistry tracks processes the agent started, persisted under the
// workspace so they survive agent restarts.
type procRegistry struct {
	Processes map[string]*ProcRecord `json:"processes"`
}

// ProcRecord is one registered background process.
type ProcRecord struct {
	Name    string    `json:"name"`
	PID     int       `json:"pid"`
	Command string    `json:"command"`
	Started time.Time `json:"started"`
	LogFile string    `json:"log_file"`
}

// ListProcessesArgs is the input of the list_processes tool.
type ListProcessesArgs struct {
	Filter string `json:"filter,omitempty" jsonschema:"optional substring to filter system processes by name or command line"`
}

// ProcStatus is one entry in the list_processes result.
type ProcStatus struct {
	Name    string `json:"name,omitempty"` // set for agent-started processes
	PID     int    `json:"pid"`
	Command string `json:"command"`
	Running bool   `json:"running"`
	Started string `json:"started,omitempty"`
	LogFile string `json:"log_file,omitempty"`
}

// ListProcessesResult is the output of the list_processes tool.
type ListProcessesResult struct {
	Agent  []ProcStatus `json:"agent_processes"`
	System []string     `json:"system_processes,omitempty"`
}

// StartProcessArgs is the input of the start_process tool.
type StartProcessArgs struct {
	Name    string `json:"name" jsonschema:"short unique name for the process, used to stop it later"`
	Command string `json:"command" jsonschema:"shell command line to run in the workspace root"`
}

// StartProcessResult is the output of the start_process tool.
type StartProcessResult struct {
	Name   string `json:"name"`
	PID    int    `json:"pid"`
	LogURI string `json:"log_uri"`
}

// StopProcessArgs is the input of the stop_process tool.
type StopProcessArgs struct {
	Name string `json:"name"`
}

// StopProcessResult is the output of the stop_process tool.
type StopProcessResult struct {
	Name   string `json:"name"`
	Signal string `json:"signal"`
}

// NewProcessTool returns list_processes (read-only), start_process and
// stop_process (both confirmation-gated: they change system state).
func NewProcessTool(w Workspace, opts Options) ([]tool.Tool, error) {
	list, err := functiontool.New(
		functiontool.Config{
			Name:        "list_processes",
			Description: "Lists background processes the agent started (with running state and log files) plus optionally filtered system processes. Read-only.",
		},
		func(ctx agent.Context, args ListProcessesArgs) (ListProcessesResult, error) {
			return ListProcessesIn(w, args.Filter)
		},
	)
	if err != nil {
		return nil, err
	}
	start, err := functiontool.New(
		functiontool.Config{
			Name:                "start_process",
			Description:         "Starts a named background process in the workspace root; output goes to logs/processes/<name>.log. Use for robots, watchers and long-running scripts. Requires confirmation.",
			RequireConfirmation: !opts.AutoApprove,
		},
		func(ctx agent.Context, args StartProcessArgs) (StartProcessResult, error) {
			return StartProcessIn(w, args.Name, args.Command)
		},
	)
	if err != nil {
		return nil, err
	}
	stop, err := functiontool.New(
		functiontool.Config{
			Name:                "stop_process",
			Description:         "Stops an agent-started background process by name (SIGTERM, then SIGKILL). Requires confirmation.",
			RequireConfirmation: !opts.AutoApprove,
		},
		func(ctx agent.Context, args StopProcessArgs) (StopProcessResult, error) {
			return StopProcessIn(w, args.Name)
		},
	)
	if err != nil {
		return nil, err
	}
	return []tool.Tool{list, start, stop}, nil
}

func registryPath(w Workspace) string {
	return filepath.Join(w.Root, "logs", "processes", "registry.json")
}

func loadRegistry(w Workspace) (*procRegistry, error) {
	reg := &procRegistry{Processes: map[string]*ProcRecord{}}
	raw, err := os.ReadFile(registryPath(w))
	if err != nil {
		if os.IsNotExist(err) {
			return reg, nil
		}
		return nil, err
	}
	if err := json.Unmarshal(raw, reg); err != nil {
		return nil, err
	}
	if reg.Processes == nil {
		reg.Processes = map[string]*ProcRecord{}
	}
	return reg, nil
}

func saveRegistry(w Workspace, reg *procRegistry) error {
	if err := os.MkdirAll(filepath.Dir(registryPath(w)), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(reg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(registryPath(w), raw, 0o644)
}

// ListProcessesIn is the core of list_processes.
func ListProcessesIn(w Workspace, filter string) (ListProcessesResult, error) {
	reg, err := loadRegistry(w)
	if err != nil {
		return ListProcessesResult{}, err
	}
	res := ListProcessesResult{Agent: make([]ProcStatus, 0, len(reg.Processes))}
	for name, rec := range reg.Processes {
		res.Agent = append(res.Agent, ProcStatus{
			Name:    name,
			PID:     rec.PID,
			Command: rec.Command,
			Running: pidAlive(rec.PID),
			Started: rec.Started.Format(time.RFC3339),
			LogFile: rec.LogFile,
		})
	}
	if filter != "" {
		out, err := exec.Command("ps", "-eo", "pid,args").Output()
		if err == nil {
			for _, line := range strings.Split(string(out), "\n") {
				if strings.Contains(line, filter) {
					res.System = append(res.System, strings.TrimSpace(line))
					if len(res.System) >= 50 {
						break
					}
				}
			}
		}
	}
	return res, nil
}

// StartProcessIn is the core of start_process.
func StartProcessIn(w Workspace, name, command string) (StartProcessResult, error) {
	if strings.TrimSpace(name) == "" {
		return StartProcessResult{}, fmt.Errorf("name is required")
	}
	if strings.TrimSpace(command) == "" {
		return StartProcessResult{}, fmt.Errorf("command is required")
	}
	reg, err := loadRegistry(w)
	if err != nil {
		return StartProcessResult{}, err
	}
	if old, ok := reg.Processes[name]; ok && pidAlive(old.PID) {
		return StartProcessResult{}, fmt.Errorf("process %q already running (pid %d); stop it first", name, old.PID)
	}
	logDir := filepath.Join(w.Root, "logs", "processes")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return StartProcessResult{}, err
	}
	logPath := filepath.Join(logDir, name+".log")
	logFile, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return StartProcessResult{}, err
	}
	defer logFile.Close()

	cmd := exec.Command(shellCommand.path, append(append([]string{}, shellCommand.extraArgs...), "-c", command)...)
	cmd.Dir = w.Root
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	// Detach from this process group so the agent does not own the child.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return StartProcessResult{}, err
	}
	// Reap the child when it eventually exits; otherwise it lingers as a
	// zombie that still answers kill -0.
	go func() { _ = cmd.Wait() }()
	reg.Processes[name] = &ProcRecord{
		Name:    name,
		PID:     cmd.Process.Pid,
		Command: command,
		Started: time.Now().UTC(),
		LogFile: logPath,
	}
	if err := saveRegistry(w, reg); err != nil {
		return StartProcessResult{}, err
	}
	// Reap later; we detach, so the child is not our zombie concern.
	return StartProcessResult{Name: name, PID: cmd.Process.Pid, LogURI: "logs/processes/" + name + ".log"}, nil
}

// StopProcessIn is the core of stop_process.
func StopProcessIn(w Workspace, name string) (StopProcessResult, error) {
	reg, err := loadRegistry(w)
	if err != nil {
		return StopProcessResult{}, err
	}
	rec, ok := reg.Processes[name]
	if !ok {
		return StopProcessResult{}, fmt.Errorf("no process named %q", name)
	}
	if !pidAlive(rec.PID) {
		delete(reg.Processes, name)
		_ = saveRegistry(w, reg)
		return StopProcessResult{}, fmt.Errorf("process %q (pid %d) is not running; removed from registry", name, rec.PID)
	}
	if err := syscall.Kill(rec.PID, syscall.SIGTERM); err != nil {
		return StopProcessResult{}, fmt.Errorf("signal pid %d: %w", rec.PID, err)
	}
	// Wait up to 3s for a clean exit, then force.
	for i := 0; i < 30 && pidAlive(rec.PID); i++ {
		time.Sleep(100 * time.Millisecond)
	}
	signal := "SIGTERM"
	if pidAlive(rec.PID) {
		_ = syscall.Kill(rec.PID, syscall.SIGKILL)
		signal = "SIGKILL"
	}
	delete(reg.Processes, name)
	if err := saveRegistry(w, reg); err != nil {
		return StopProcessResult{}, err
	}
	return StopProcessResult{Name: name, Signal: signal}, nil
}

func pidAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	return syscall.Kill(pid, 0) == nil
}
