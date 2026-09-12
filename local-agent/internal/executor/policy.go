package executor

// Classify decides which isolation tier a task runs under. This is the
// single place that encodes the policy from SOURCE_OF_TRUTH.md — do not
// duplicate this decision elsewhere.
//
// Precedence: Persistent beats MultiStep beats the host default, because a
// task that never stops needs the strongest boundary regardless of what
// else is true about it.
func Classify(task Task) Tier {
	switch {
	case task.Persistent:
		return TierVM
	case task.MultiStep:
		return TierContainer
	default:
		return TierHost
	}
}

// Registry resolves a Tier to the concrete Executor implementation to use.
// Constructed once at startup and passed into core dispatch — this is the
// only place backend selection happens, so swapping an implementation
// (e.g. moving the VM tier from plain-SSH to Firecracker, per
// ARCHITECTURE.md) touches one line here, not every call site.
type Registry struct {
	host      Executor
	container Executor
	vm        Executor
}

func NewRegistry(host, container, vm Executor) *Registry {
	return &Registry{host: host, container: container, vm: vm}
}

func (r *Registry) For(tier Tier) Executor {
	switch tier {
	case TierContainer:
		return r.container
	case TierVM:
		return r.vm
	default:
		return r.host
	}
}
