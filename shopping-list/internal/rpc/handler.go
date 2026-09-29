// Package rpc exposes shopping use cases through ConnectRPC.
package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"connectrpc.com/connect"
	shoppingv1 "github.com/example/shopping-list/gen/shopping/v1"
	"github.com/example/shopping-list/internal/domain"
)

type Handler struct {
	repo      domain.Repository
	planner   domain.Planner
	discounts domain.DiscountSource
}

func NewHandler(repo domain.Repository, planner domain.Planner, discounts domain.DiscountSource) *Handler {
	return &Handler{repo: repo, planner: planner, discounts: discounts}
}

func (h *Handler) ListLists(ctx context.Context, req *connect.Request[shoppingv1.ListListsRequest]) (*connect.Response[shoppingv1.ListListsResponse], error) {
	v, err := h.repo.ListLists(ctx, req.Msg.GetIncludeArchived())
	if err != nil {
		return nil, rpcError(err)
	}
	out := &shoppingv1.ListListsResponse{}
	for _, x := range v {
		out.Lists = append(out.Lists, listPB(x))
	}
	return connect.NewResponse(out), nil
}
func (h *Handler) CreateList(ctx context.Context, req *connect.Request[shoppingv1.CreateListRequest]) (*connect.Response[shoppingv1.ShoppingList], error) {
	v, err := h.repo.CreateList(ctx, domain.ShoppingList{Name: req.Msg.GetName(), Description: req.Msg.GetDescription(), Color: req.Msg.GetColor(), Default: req.Msg.GetMakeDefault()}, req.Msg.GetIdempotencyKey())
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(listPB(v)), nil
}
func (h *Handler) UpdateList(ctx context.Context, req *connect.Request[shoppingv1.UpdateListRequest]) (*connect.Response[shoppingv1.ShoppingList], error) {
	v, err := h.repo.UpdateList(ctx, domain.ShoppingList{ID: req.Msg.GetId(), Name: req.Msg.GetName(), Description: req.Msg.GetDescription(), Color: req.Msg.GetColor(), Archived: req.Msg.GetArchived(), Version: req.Msg.GetExpectedVersion()}, req.Msg.GetMakeDefault())
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(listPB(v)), nil
}
func (h *Handler) ListItems(ctx context.Context, req *connect.Request[shoppingv1.ListItemsRequest]) (*connect.Response[shoppingv1.ListItemsResponse], error) {
	statuses := make([]domain.ItemStatus, 0, len(req.Msg.GetStatuses()))
	for _, v := range req.Msg.GetStatuses() {
		if v != shoppingv1.ItemStatus_ITEM_STATUS_UNSPECIFIED {
			statuses = append(statuses, domain.ItemStatus(v))
		}
	}
	items, total, err := h.repo.ListItems(ctx, domain.ItemFilter{ListID: req.Msg.GetListId(), Statuses: statuses, Query: req.Msg.GetQuery(), Store: req.Msg.GetStore(), Category: req.Msg.GetCategory(), Limit: int(req.Msg.GetLimit()), Offset: int(req.Msg.GetOffset())})
	if err != nil {
		return nil, rpcError(err)
	}
	out := &shoppingv1.ListItemsResponse{Total: total}
	for _, i := range items {
		out.Items = append(out.Items, itemPB(i))
	}
	return connect.NewResponse(out), nil
}
func (h *Handler) AddItem(ctx context.Context, req *connect.Request[shoppingv1.AddItemRequest]) (*connect.Response[shoppingv1.Item], error) {
	due, err := optionalTime(req.Msg.GetDueAt())
	if err != nil {
		return nil, rpcError(err)
	}
	i := domain.Item{ListID: req.Msg.GetListId(), Name: req.Msg.GetName(), Quantity: req.Msg.GetQuantity(), Unit: req.Msg.GetUnit(), PreferredStore: req.Msg.GetPreferredStore(), Category: req.Msg.GetCategory(), Note: req.Msg.GetNote(), Priority: domain.Priority(req.Msg.GetPriority()), EstimatedUnitPrice: moneyDomain(req.Msg.GetEstimatedUnitPrice()), Barcode: req.Msg.GetBarcode(), ImageURL: req.Msg.GetImageUrl(), DueAt: due}
	i, err = h.repo.AddItem(ctx, i, domain.AddOptions{MergeDuplicate: req.Msg.GetMergeDuplicate(), IdempotencyKey: req.Msg.GetIdempotencyKey()})
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(itemPB(i)), nil
}
func (h *Handler) UpdateItem(ctx context.Context, req *connect.Request[shoppingv1.UpdateItemRequest]) (*connect.Response[shoppingv1.Item], error) {
	due, err := optionalTime(req.Msg.GetDueAt())
	if err != nil {
		return nil, rpcError(err)
	}
	i := domain.Item{ID: req.Msg.GetId(), Name: req.Msg.GetName(), Quantity: req.Msg.GetQuantity(), Unit: req.Msg.GetUnit(), PreferredStore: req.Msg.GetPreferredStore(), Category: req.Msg.GetCategory(), Note: req.Msg.GetNote(), Priority: domain.Priority(req.Msg.GetPriority()), EstimatedUnitPrice: moneyDomain(req.Msg.GetEstimatedUnitPrice()), Barcode: req.Msg.GetBarcode(), ImageURL: req.Msg.GetImageUrl(), DueAt: due, Position: req.Msg.GetPosition(), Version: req.Msg.GetExpectedVersion()}
	i, err = h.repo.UpdateItem(ctx, i)
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(itemPB(i)), nil
}
func (h *Handler) SetItemStatus(ctx context.Context, req *connect.Request[shoppingv1.SetItemStatusRequest]) (*connect.Response[shoppingv1.Item], error) {
	i, err := h.repo.SetItemStatus(ctx, req.Msg.GetId(), domain.Completion{Status: domain.ItemStatus(req.Msg.GetStatus()), ExpectedVersion: req.Msg.GetExpectedVersion(), ActualUnitPrice: moneyDomain(req.Msg.GetActualUnitPrice()), ActualStore: req.Msg.GetActualStore()})
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(itemPB(i)), nil
}
func (h *Handler) DeleteItem(ctx context.Context, req *connect.Request[shoppingv1.DeleteItemRequest]) (*connect.Response[shoppingv1.Item], error) {
	i, err := h.repo.SetItemStatus(ctx, req.Msg.GetId(), domain.Completion{Status: domain.StatusArchived, ExpectedVersion: req.Msg.GetExpectedVersion()})
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(itemPB(i)), nil
}
func (h *Handler) CompleteItems(ctx context.Context, req *connect.Request[shoppingv1.CompleteItemsRequest]) (*connect.Response[shoppingv1.CompleteItemsResponse], error) {
	items, err := h.repo.CompleteItems(ctx, req.Msg.GetIds(), req.Msg.GetActualStore())
	if err != nil {
		return nil, rpcError(err)
	}
	out := &shoppingv1.CompleteItemsResponse{}
	for _, i := range items {
		out.Items = append(out.Items, itemPB(i))
	}
	return connect.NewResponse(out), nil
}
func (h *Handler) GetSummary(ctx context.Context, req *connect.Request[shoppingv1.GetSummaryRequest]) (*connect.Response[shoppingv1.Summary], error) {
	v, err := h.repo.Summary(ctx, req.Msg.GetListId())
	if err != nil {
		return nil, rpcError(err)
	}
	out := &shoppingv1.Summary{ActiveCount: v.ActiveCount, CompletedCount: v.CompletedCount, Stores: v.Stores, Categories: v.Categories}
	for _, m := range v.EstimatedTotals {
		out.EstimatedTotals = append(out.EstimatedTotals, moneyPB(m))
	}
	if len(out.EstimatedTotals) == 1 {
		out.EstimatedTotal = out.EstimatedTotals[0]
	}
	return connect.NewResponse(out), nil
}
func (h *Handler) GetSuggestions(ctx context.Context, req *connect.Request[shoppingv1.GetSuggestionsRequest]) (*connect.Response[shoppingv1.GetSuggestionsResponse], error) {
	hist, err := h.repo.PurchaseHistory(ctx)
	if err != nil {
		return nil, rpcError(err)
	}
	suggestions, err := h.planner.Suggestions(ctx, hist, int(req.Msg.GetLimit()))
	if err != nil {
		return nil, rpcError(err)
	}
	active := make(map[string]struct{})
	if req.Msg.GetListId() > 0 {
		items, _, e := h.repo.ListItems(ctx, domain.ItemFilter{ListID: req.Msg.GetListId(), Statuses: []domain.ItemStatus{domain.StatusActive}, Limit: 500})
		if e != nil {
			return nil, rpcError(e)
		}
		for _, i := range items {
			active[strings.ToLower(strings.TrimSpace(i.Name))] = struct{}{}
		}
	}
	out := &shoppingv1.GetSuggestionsResponse{}
	for _, s := range suggestions {
		if _, exists := active[strings.ToLower(strings.TrimSpace(s.Name))]; exists {
			continue
		}
		out.Suggestions = append(out.Suggestions, &shoppingv1.Suggestion{Name: s.Name, PreferredStore: s.PreferredStore, Confidence: s.Confidence, Reason: s.Reason})
	}
	return connect.NewResponse(out), nil
}
func (h *Handler) SearchDiscounts(ctx context.Context, req *connect.Request[shoppingv1.SearchDiscountsRequest]) (*connect.Response[shoppingv1.SearchDiscountsResponse], error) {
	if len(req.Msg.GetProducts()) > 100 {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("at most 100 products may be searched"))
	}
	d, err := h.discounts.Search(ctx, req.Msg.GetProducts())
	if err != nil {
		return nil, rpcError(err)
	}
	out := &shoppingv1.SearchDiscountsResponse{}
	for _, v := range d {
		out.Discounts = append(out.Discounts, &shoppingv1.Discount{Product: v.Product, Store: v.Store, Price: v.Price, SourceUrl: v.SourceURL, ValidUntil: v.ValidUntil})
	}
	return connect.NewResponse(out), nil
}
func (h *Handler) ExportData(ctx context.Context, _ *connect.Request[shoppingv1.ExportDataRequest]) (*connect.Response[shoppingv1.ExportDataResponse], error) {
	v, err := h.repo.Export(ctx)
	if err != nil {
		return nil, rpcError(err)
	}
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(&shoppingv1.ExportDataResponse{MediaType: "application/json", Data: data, ExportedAt: v.ExportedAt.Format(time.RFC3339)}), nil
}

func listPB(v domain.ShoppingList) *shoppingv1.ShoppingList {
	return &shoppingv1.ShoppingList{Id: v.ID, Name: v.Name, Description: v.Description, Color: v.Color, IsDefault: v.Default, Archived: v.Archived, Version: v.Version, CreatedAt: v.CreatedAt.Format(time.RFC3339), UpdatedAt: v.UpdatedAt.Format(time.RFC3339)}
}
func itemPB(i domain.Item) *shoppingv1.Item {
	p := &shoppingv1.Item{Id: i.ID, ListId: i.ListID, Name: i.Name, Quantity: i.Quantity, Unit: i.Unit, PreferredStore: i.PreferredStore, Category: i.Category, Note: i.Note, Priority: shoppingv1.Priority(i.Priority), Status: shoppingv1.ItemStatus(i.Status), EstimatedUnitPrice: moneyPB(i.EstimatedUnitPrice), Barcode: i.Barcode, ImageUrl: i.ImageURL, Position: i.Position, Version: i.Version, CreatedAt: i.CreatedAt.Format(time.RFC3339), UpdatedAt: i.UpdatedAt.Format(time.RFC3339)}
	if i.DueAt != nil {
		p.DueAt = i.DueAt.Format(time.RFC3339)
	}
	if i.CompletedAt != nil {
		p.CompletedAt = i.CompletedAt.Format(time.RFC3339)
	}
	if i.ArchivedAt != nil {
		p.ArchivedAt = i.ArchivedAt.Format(time.RFC3339)
	}
	return p
}
func moneyPB(v domain.Money) *shoppingv1.Money {
	if v.MinorUnits == 0 && v.Currency == "" {
		return nil
	}
	return &shoppingv1.Money{MinorUnits: v.MinorUnits, Currency: v.Currency}
}
func moneyDomain(v *shoppingv1.Money) domain.Money {
	if v == nil {
		return domain.Money{}
	}
	return domain.Money{MinorUnits: v.GetMinorUnits(), Currency: v.GetCurrency()}
}
func optionalTime(v string) (*time.Time, error) {
	if strings.TrimSpace(v) == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, v)
	if err != nil {
		return nil, fmt.Errorf("%w: time must use RFC3339", domain.ErrInvalid)
	}
	return &t, nil
}
func rpcError(err error) *connect.Error {
	switch {
	case errors.Is(err, sql.ErrNoRows):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, domain.ErrConflict):
		return connect.NewError(connect.CodeAborted, err)
	case errors.Is(err, domain.ErrDuplicate):
		return connect.NewError(connect.CodeAlreadyExists, err)
	case errors.Is(err, domain.ErrInvalid):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, domain.ErrListNotEmpty):
		return connect.NewError(connect.CodeFailedPrecondition, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}

// SameOrigin rejects cross-site browser mutations. Authentication is still required before public hosting.
func SameOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			origin := r.Header.Get("Origin")
			if origin != "" && origin != "http://"+r.Host && origin != "https://"+r.Host {
				http.Error(w, "forbidden origin", http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
