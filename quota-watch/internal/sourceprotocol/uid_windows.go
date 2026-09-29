//go:build windows

package sourceprotocol

import "os"

func stUid(os.FileInfo) uint32 { return 0 }
