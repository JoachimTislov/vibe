package core

import "errors"

var (
	ErrUnknownPrincipal = errors.New("core: unknown principal_id")
	ErrApprovalRequired = errors.New("core: action requires approval before it can proceed")
	ErrApprovalDenied   = errors.New("core: action was denied by approval gate")
	ErrApprovalExpired  = errors.New("core: approval request expired before a decision was made")
	ErrConversationDown = errors.New("core: conversation actor is no longer accepting messages")
)
