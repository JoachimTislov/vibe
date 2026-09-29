// Package httpserver assembles the production HTTP transport.
package httpserver

import (
	"net/http"

	shoppingv1connect "github.com/example/shopping-list/gen/shopping/v1/shoppingv1connect"
	"github.com/example/shopping-list/internal/domain"
	shoppingrpc "github.com/example/shopping-list/internal/rpc"
)

// NewAPI returns the same RPC handler stack used by the production server.
func NewAPI(repo domain.Repository, planner domain.Planner, discounts domain.DiscountSource) http.Handler {
	api := shoppingrpc.NewHandler(repo, planner, discounts)
	path, handler := shoppingv1connect.NewShoppingServiceHandler(api)
	mux := http.NewServeMux()
	mux.Handle(path, shoppingrpc.SameOrigin(http.MaxBytesHandler(handler, 1<<20)))
	return mux
}
