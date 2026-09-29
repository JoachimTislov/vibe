// Package domain contains the dependency-free business model.
package domain

import (
	"context"
	"errors"
	"time"
)

var (
	ErrConflict     = errors.New("record was changed by another client")
	ErrDuplicate    = errors.New("item already exists")
	ErrInvalid      = errors.New("invalid value")
	ErrListNotEmpty = errors.New("list contains active items")
)

type ItemStatus int

const (
	StatusActive ItemStatus = iota + 1
	StatusCompleted
	StatusArchived
)

type Priority int

const (
	PriorityLow Priority = iota + 1
	PriorityNormal
	PriorityHigh
	PriorityUrgent
)

type Money struct {
	MinorUnits int64
	Currency   string
}
type ShoppingList struct {
	ID                       int64
	Name, Description, Color string
	Default, Archived        bool
	Version                  int64
	CreatedAt, UpdatedAt     time.Time
}
type Item struct {
	ID, ListID                                                 int64
	Name, NormalizedName, Unit, PreferredStore, Category, Note string
	Quantity                                                   float64
	Priority                                                   Priority
	Status                                                     ItemStatus
	EstimatedUnitPrice                                         Money
	Barcode, ImageURL                                          string
	Position                                                   int32
	Version                                                    int64
	DueAt, CompletedAt, ArchivedAt                             *time.Time
	CreatedAt, UpdatedAt                                       time.Time
}
type Purchase struct {
	Name, Store, Unit, Currency string
	Quantity                    float64
	UnitPriceMinor              int64
	BoughtAt                    time.Time
}
type ItemFilter struct {
	ListID                 int64
	Statuses               []ItemStatus
	Query, Store, Category string
	Limit, Offset          int
}
type AddOptions struct {
	MergeDuplicate bool
	IdempotencyKey string
}
type Completion struct {
	Status          ItemStatus
	ExpectedVersion int64
	ActualUnitPrice Money
	ActualStore     string
}
type Summary struct {
	ActiveCount, CompletedCount int64
	EstimatedTotals             []Money
	Stores, Categories          []string
}
type Export struct {
	Lists      []ShoppingList `json:"lists"`
	Items      []Item         `json:"items"`
	Purchases  []Purchase     `json:"purchases"`
	ExportedAt time.Time      `json:"exported_at"`
}
type Suggestion struct {
	Name, PreferredStore, Reason string
	Confidence                   float64
}
type Discount struct{ Product, Store, Price, SourceURL, ValidUntil string }

type Repository interface {
	ListLists(context.Context, bool) ([]ShoppingList, error)
	CreateList(context.Context, ShoppingList, string) (ShoppingList, error)
	UpdateList(context.Context, ShoppingList, bool) (ShoppingList, error)
	ListItems(context.Context, ItemFilter) ([]Item, int64, error)
	AddItem(context.Context, Item, AddOptions) (Item, error)
	UpdateItem(context.Context, Item) (Item, error)
	SetItemStatus(context.Context, int64, Completion) (Item, error)
	CompleteItems(context.Context, []int64, string) ([]Item, error)
	Summary(context.Context, int64) (Summary, error)
	PurchaseHistory(context.Context) ([]Purchase, error)
	Export(context.Context) (Export, error)
}
type DiscountSource interface {
	Search(context.Context, []string) ([]Discount, error)
}
type Planner interface {
	Suggestions(context.Context, []Purchase, int) ([]Suggestion, error)
}
