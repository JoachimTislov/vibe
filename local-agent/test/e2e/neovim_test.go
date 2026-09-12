package e2e

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNeovimClientEntrypoint(t *testing.T) {
	if _, err := exec.LookPath("nvim"); err != nil {
		t.Fatal("nvim is required for the complete E2E suite")
	}
	socket := startCore(t)
	model := modelServer(t, func(r modelRequest) any {
		return answer("editor got server output: " + r.Messages[len(r.Messages)-1].Content)
	})
	path := writeConfig(t, cfgFor(socket, model.URL))
	plugin, err := filepath.Abs("../../integrations/neovim")
	if err != nil {
		t.Fatal(err)
	}
	lua := fmt.Sprintf(`vim.opt.rtp:append(%q); local a=require('local_agent'); a.setup({command={%q,'local','--json','--config',%q}}); a.ask('neovim prompt',function(text,err) print(text); vim.schedule(function() if err and err~='' then vim.cmd('cquit 1') else vim.cmd('qa!') end end) end)`, plugin, filepath.Join(binaries, "agent"), path)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "nvim", "--headless", "-u", "NONE", "-i", "NONE", "-n", "-c", "lua "+lua)
	data, err := cmd.CombinedOutput()
	if err != nil || !strings.Contains(string(data), "editor got server output: neovim prompt") {
		t.Fatalf("Neovim did not receive core output: %v %s", err, data)
	}
}
