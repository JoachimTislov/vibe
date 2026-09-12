// Package credentials stores secrets exclusively in the OS keychain.
package credentials

import "github.com/zalando/go-keyring"

type Store interface {
	Get(string) (string, error)
	Set(string, string) error
	Delete(string) error
}
type Keychain struct{}

func (Keychain) Get(key string) (string, error) { return keyring.Get("agentic-gateway", key) }
func (Keychain) Set(key, value string) error    { return keyring.Set("agentic-gateway", key, value) }
func (Keychain) Delete(key string) error        { return keyring.Delete("agentic-gateway", key) }
