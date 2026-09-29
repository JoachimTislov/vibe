package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"github.com/example/shopping-list/internal/domain"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}
func defaultListID(t *testing.T, s *Store) int64 {
	t.Helper()
	lists, err := s.ListLists(context.Background(), false)
	if err != nil || len(lists) != 1 || !lists[0].Default {
		t.Fatalf("default list: %#v, %v", lists, err)
	}
	return lists[0].ID
}

func TestCompleteUndoAndCompleteRecordsExpectedPurchases(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	i, err := s.AddItem(ctx, domain.Item{ListID: defaultListID(t, s), Name: "Oats", Quantity: 2, PreferredStore: "Co-op"}, domain.AddOptions{})
	if err != nil {
		t.Fatal(err)
	}
	i, err = s.SetItemStatus(ctx, i.ID, domain.Completion{Status: domain.StatusCompleted, ExpectedVersion: i.Version})
	if err != nil || i.Status != domain.StatusCompleted {
		t.Fatalf("complete: %v %#v", err, i)
	}
	h, _ := s.PurchaseHistory(ctx)
	if len(h) != 1 {
		t.Fatalf("want one purchase, got %d", len(h))
	}
	i, err = s.SetItemStatus(ctx, i.ID, domain.Completion{Status: domain.StatusActive, ExpectedVersion: i.Version})
	if err != nil {
		t.Fatal(err)
	}
	h, _ = s.PurchaseHistory(ctx)
	if len(h) != 0 {
		t.Fatalf("undo should remove completion purchase: %#v", h)
	}
	_, err = s.SetItemStatus(ctx, i.ID, domain.Completion{Status: domain.StatusCompleted, ExpectedVersion: i.Version})
	if err != nil {
		t.Fatal(err)
	}
	h, _ = s.PurchaseHistory(ctx)
	if len(h) != 1 {
		t.Fatalf("want one purchase after recompletion, got %d", len(h))
	}
}
func TestUnicodeDuplicateMergeAndIdempotency(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	listID := defaultListID(t, s)
	first, err := s.AddItem(ctx, domain.Item{ListID: listID, Name: "  CAFÉ  ", Quantity: 1, Unit: "bag"}, domain.AddOptions{IdempotencyKey: "request-1"})
	if err != nil {
		t.Fatal(err)
	}
	retry, err := s.AddItem(ctx, domain.Item{ListID: listID, Name: "ignored", Quantity: 99}, domain.AddOptions{IdempotencyKey: "request-1"})
	if err != nil || retry.ID != first.ID || retry.Quantity != 1 {
		t.Fatalf("idempotent retry: %#v %v", retry, err)
	}
	merged, err := s.AddItem(ctx, domain.Item{ListID: listID, Name: "cafe\u0301", Quantity: 2, Unit: "bag"}, domain.AddOptions{MergeDuplicate: true})
	if err != nil {
		t.Fatal(err)
	}
	if merged.ID != first.ID || merged.Quantity != 3 {
		t.Fatalf("not merged: %#v", merged)
	}
}
func TestOptimisticConflictArchiveAndSummary(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	listID := defaultListID(t, s)
	i, err := s.AddItem(ctx, domain.Item{ListID: listID, Name: "Milk", Quantity: 2, EstimatedUnitPrice: domain.Money{MinorUnits: 250, Currency: "nok"}}, domain.AddOptions{})
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.UpdateItem(ctx, domain.Item{ID: i.ID, Name: "Milk", Quantity: 1, Version: i.Version + 99})
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("want conflict, got %v", err)
	}
	summary, err := s.Summary(ctx, listID)
	if err != nil || summary.ActiveCount != 1 || len(summary.EstimatedTotals) != 1 || summary.EstimatedTotals[0].MinorUnits != 500 || summary.EstimatedTotals[0].Currency != "NOK" {
		t.Fatalf("bad summary: %#v %v", summary, err)
	}
	i, err = s.SetItemStatus(ctx, i.ID, domain.Completion{Status: domain.StatusArchived, ExpectedVersion: i.Version})
	if err != nil {
		t.Fatal(err)
	}
	items, total, err := s.ListItems(ctx, domain.ItemFilter{ListID: listID})
	if err != nil || len(items) != 0 || total != 0 {
		t.Fatalf("archive visible: %#v %d %v", items, total, err)
	}
	items, total, err = s.ListItems(ctx, domain.ItemFilter{ListID: listID, Statuses: []domain.ItemStatus{domain.StatusArchived}})
	if err != nil || len(items) != 1 || total != 1 || items[0].ID != i.ID {
		t.Fatalf("archive missing: %#v %d %v", items, total, err)
	}
}
func TestRejectsNonFiniteAndBadCurrency(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	listID := defaultListID(t, s)
	cases := []domain.Item{{ListID: listID, Name: "", Quantity: 1}, {ListID: listID, Name: "Milk", Quantity: -1}, {ListID: listID, Name: "Milk", Quantity: 1, EstimatedUnitPrice: domain.Money{MinorUnits: 1, Currency: "kr"}}}
	for _, tc := range cases {
		if _, err := s.AddItem(ctx, tc, domain.AddOptions{}); !errors.Is(err, domain.ErrInvalid) {
			t.Errorf("%#v: want invalid, got %v", tc, err)
		}
	}
}

func TestBatchCompletionIsAtomicAndDeduplicatesIDs(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	listID := defaultListID(t, s)
	a, err := s.AddItem(ctx, domain.Item{ListID: listID, Name: "Apples", Quantity: 1}, domain.AddOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.CompleteItems(ctx, []int64{a.ID, 999999}, ""); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("want missing item error, got %v", err)
	}
	items, _, err := s.ListItems(ctx, domain.ItemFilter{ListID: listID, Statuses: []domain.ItemStatus{domain.StatusActive}})
	if err != nil || len(items) != 1 {
		t.Fatalf("partial batch committed: %#v %v", items, err)
	}
	done, err := s.CompleteItems(ctx, []int64{a.ID, a.ID}, "")
	if err != nil || len(done) != 1 {
		t.Fatalf("duplicate IDs not collapsed: %#v %v", done, err)
	}
	history, _ := s.PurchaseHistory(ctx)
	if len(history) != 1 {
		t.Fatalf("duplicate purchase: %#v", history)
	}
}

func TestSummaryKeepsCurrenciesSeparate(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	listID := defaultListID(t, s)
	for _, item := range []domain.Item{{ListID: listID, Name: "Local", Quantity: 1, EstimatedUnitPrice: domain.Money{MinorUnits: 100, Currency: "NOK"}}, {ListID: listID, Name: "Imported", Quantity: 2, EstimatedUnitPrice: domain.Money{MinorUnits: 300, Currency: "EUR"}}} {
		if _, err := s.AddItem(ctx, item, domain.AddOptions{}); err != nil {
			t.Fatal(err)
		}
	}
	summary, err := s.Summary(ctx, listID)
	if err != nil {
		t.Fatal(err)
	}
	if len(summary.EstimatedTotals) != 2 {
		t.Fatalf("currencies were mixed: %#v", summary.EstimatedTotals)
	}
}

func TestListArchiveProtectsItemsAndDefault(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	lists, _ := s.ListLists(ctx, false)
	first := lists[0]
	if _, err := s.UpdateList(ctx, domain.ShoppingList{ID: first.ID, Name: first.Name, Color: first.Color, Archived: true, Version: first.Version}, false); !errors.Is(err, domain.ErrInvalid) {
		t.Fatalf("archived only list: %v", err)
	}
	second, err := s.CreateList(ctx, domain.ShoppingList{Name: "Hardware", Color: "#000000"}, "list-key")
	if err != nil {
		t.Fatal(err)
	}
	retry, err := s.CreateList(ctx, domain.ShoppingList{Name: "Ignored"}, "list-key")
	if err != nil || retry.ID != second.ID {
		t.Fatalf("list idempotency: %#v %v", retry, err)
	}
	item, err := s.AddItem(ctx, domain.Item{ListID: second.ID, Name: "Screws", Quantity: 1}, domain.AddOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.UpdateList(ctx, domain.ShoppingList{ID: second.ID, Name: second.Name, Color: second.Color, Archived: true, Version: second.Version}, false); !errors.Is(err, domain.ErrListNotEmpty) {
		t.Fatalf("archived nonempty list: %v", err)
	}
	if _, err = s.SetItemStatus(ctx, item.ID, domain.Completion{Status: domain.StatusArchived, ExpectedVersion: item.Version}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.UpdateList(ctx, domain.ShoppingList{ID: second.ID, Name: second.Name, Color: second.Color, Archived: true, Version: second.Version}, false); err != nil {
		t.Fatalf("archive empty list: %v", err)
	}
}
