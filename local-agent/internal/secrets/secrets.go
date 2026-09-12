// Package secrets is the only place platform tokens and model API keys are
// read or written. Per SOURCE_OF_TRUTH.md: OS keychain only, never a
// plaintext file or env var dump. Nothing outside this package should read
// a secret value directly from disk or environment.
package secrets

import "github.com/zalando/go-keyring"

// serviceName namespaces every secret this project stores in the OS
// keychain, so it shows up as one identifiable entry in Keychain
// Access / Secret Service / Credential Manager rather than scattered
// generic entries.
const serviceName = "agentic-gateway"

// Store is the interface callers depend on, not the keyring package
// directly — this is what makes the backend swappable (e.g. for a headless
// Linux box without a Secret Service daemon) without touching call sites.
type Store interface {
	Get(key string) (string, error)
	Set(key, value string) error
	Delete(key string) error
}

// KeychainStore is the default Store, backed by the OS-native credential
// manager via zalando/go-keyring (macOS Keychain, Linux Secret Service,
// Windows DPAPI).
type KeychainStore struct{}

func NewKeychainStore() *KeychainStore { return &KeychainStore{} }

func (k *KeychainStore) Get(key string) (string, error) {
	return keyring.Get(serviceName, key)
}

func (k *KeychainStore) Set(key, value string) error {
	return keyring.Set(serviceName, key, value)
}

func (k *KeychainStore) Delete(key string) error {
	return keyring.Delete(serviceName, key)
}
