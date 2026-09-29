//go:build !windows

package sourceprotocol

import (
	"os"
	"syscall"
)

func stUid(s os.FileInfo) uint32 { return s.Sys().(*syscall.Stat_t).Uid }
