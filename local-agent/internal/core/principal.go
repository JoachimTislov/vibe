package core

import "context"

// Principal identifies whose request this is. There is exactly one
// Principal in this deployment today — see SOURCE_OF_TRUTH.md's
// single-user invariant — but every request path takes a principal_id
// explicitly rather than assuming a global singleton, so adding a second
// principal later is a resolver change, not a rewrite.
type Principal struct {
	ID string
}

// Resolver maps an incoming principal_id (from InboundMessage) to a
// Principal, and is the single seam multi-tenancy would extend later.
type Resolver interface {
	Resolve(ctx context.Context, principalID string) (Principal, error)
}

// SingleUserResolver is the only implementation today: it accepts exactly
// one configured principal_id and rejects anything else. This makes the
// single-user assumption explicit and enforced, rather than implicit and
// silently relied upon elsewhere in the codebase.
type SingleUserResolver struct {
	OnlyPrincipalID string
}

func NewSingleUserResolver(onlyPrincipalID string) *SingleUserResolver {
	return &SingleUserResolver{OnlyPrincipalID: onlyPrincipalID}
}

func (r *SingleUserResolver) Resolve(ctx context.Context, principalID string) (Principal, error) {
	if principalID == "" || principalID != r.OnlyPrincipalID {
		return Principal{}, ErrUnknownPrincipal
	}
	return Principal{ID: principalID}, nil
}
