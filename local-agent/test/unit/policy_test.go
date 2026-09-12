package unit

import (
	"testing"

	"github.com/YOURNAME/agentic-gateway/internal/executor"
)

func TestClassify_DefaultsToHost(t *testing.T) {
	tier := executor.Classify(executor.Task{Command: "echo"})
	if tier != executor.TierHost {
		t.Fatalf("expected TierHost for a plain task, got %s", tier)
	}
}

func TestClassify_MultiStepGetsContainer(t *testing.T) {
	tier := executor.Classify(executor.Task{Command: "research", MultiStep: true})
	if tier != executor.TierContainer {
		t.Fatalf("expected TierContainer for a multi-step task, got %s", tier)
	}
}

func TestClassify_PersistentGetsVM(t *testing.T) {
	tier := executor.Classify(executor.Task{Command: "daemon", Persistent: true})
	if tier != executor.TierVM {
		t.Fatalf("expected TierVM for a persistent task, got %s", tier)
	}
}

// Persistent must win even if MultiStep is also set — an agent that never
// stops needs the strongest boundary regardless of what else is true about
// the task. See the precedence comment in policy.go.
func TestClassify_PersistentBeatsMultiStep(t *testing.T) {
	tier := executor.Classify(executor.Task{Command: "daemon", Persistent: true, MultiStep: true})
	if tier != executor.TierVM {
		t.Fatalf("expected Persistent to take precedence over MultiStep, got %s", tier)
	}
}
