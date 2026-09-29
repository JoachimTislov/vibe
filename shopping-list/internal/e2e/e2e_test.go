package e2e

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	shoppingv1 "github.com/example/shopping-list/gen/shopping/v1"
	"github.com/example/shopping-list/internal/agents"
	"github.com/example/shopping-list/internal/cli"
	"github.com/example/shopping-list/internal/httpserver"
	"github.com/example/shopping-list/internal/integrations/discount"
	store "github.com/example/shopping-list/internal/store/sqlite"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

const baseURL = "http://basket.test"

type handlerTransport struct{ handler http.Handler }

func (t handlerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	rec := httptest.NewRecorder()
	t.handler.ServeHTTP(rec, req)
	return rec.Result(), nil
}
func harness(t *testing.T) *http.Client {
	t.Helper()
	repo, err := store.Open(filepath.Join(t.TempDir(), "e2e.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = repo.Close() })
	finder, err := discount.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	handler := httpserver.NewAPI(repo, agents.HistoryProfiler{}, finder)
	return &http.Client{Transport: handlerTransport{handler: handler}, Timeout: 5 * time.Second}
}

func TestRawConnectHTTPWorkflowAndMiddleware(t *testing.T) {
	client := harness(t)
	ctx := context.Background()
	created := &shoppingv1.ShoppingList{}
	rawCall(t, ctx, client, "CreateList", map[string]any{"name": "Weekend", "color": "#112233", "idempotencyKey": "http-list-1"}, created, http.StatusOK, "")
	retry := &shoppingv1.ShoppingList{}
	rawCall(t, ctx, client, "CreateList", map[string]any{"name": "Ignored retry", "idempotencyKey": "http-list-1"}, retry, http.StatusOK, "")
	if retry.Id != created.Id {
		t.Fatalf("HTTP idempotency failed: %d != %d", retry.Id, created.Id)
	}
	item := &shoppingv1.Item{}
	rawCall(t, ctx, client, "AddItem", map[string]any{"listId": created.Id, "name": "Crème fraîche", "quantity": 2, "unit": "tub", "preferredStore": "Market", "estimatedUnitPrice": map[string]any{"minorUnits": "399", "currency": "NOK"}, "idempotencyKey": "http-item-1"}, item, http.StatusOK, "")
	listed := &shoppingv1.ListItemsResponse{}
	rawCall(t, ctx, client, "ListItems", map[string]any{"listId": created.Id, "statuses": []string{"ITEM_STATUS_ACTIVE"}, "query": "CRÈME"}, listed, http.StatusOK, "")
	if listed.Total != 1 || len(listed.Items) != 1 {
		t.Fatalf("HTTP list/search failed: %#v", listed)
	}
	done := &shoppingv1.Item{}
	rawCall(t, ctx, client, "SetItemStatus", map[string]any{"id": item.Id, "status": "ITEM_STATUS_COMPLETED", "expectedVersion": item.Version, "actualStore": "Market"}, done, http.StatusOK, "")
	if done.Status != shoppingv1.ItemStatus_ITEM_STATUS_COMPLETED {
		t.Fatalf("HTTP completion failed: %v", done.Status)
	}
	rawCall(t, ctx, client, "SetItemStatus", map[string]any{"id": item.Id, "status": "ITEM_STATUS_ACTIVE", "expectedVersion": item.Version}, nil, http.StatusConflict, "")
	rawCall(t, ctx, client, "AddItem", map[string]any{"listId": created.Id, "name": "Blocked", "quantity": 1}, nil, http.StatusForbidden, "https://evil.example")
}

func TestCLIWorkflowOverConnectHTTP(t *testing.T) {
	client := harness(t)
	ctx := context.Background()
	lists := &shoppingv1.ListListsResponse{}
	runCLI(t, ctx, client, lists, "--json", "lists")
	if len(lists.Lists) != 1 || !lists.Lists[0].IsDefault {
		t.Fatalf("CLI lists: %#v", lists)
	}
	listID := lists.Lists[0].Id
	added := &shoppingv1.Item{}
	runCLI(t, ctx, client, added, "--json", "add", "--list", itoa(listID), "--qty", "2.5", "--unit", "kg", "--store", "Co-op", "--category", "Produce", "--request-id", "cli-add-1", "Potatoes")
	if added.Name != "Potatoes" || added.Quantity != 2.5 {
		t.Fatalf("CLI add: %#v", added)
	}
	retry := &shoppingv1.Item{}
	runCLI(t, ctx, client, retry, "--json", "add", "--list", itoa(listID), "--qty", "99", "--request-id", "cli-add-1", "Ignored")
	if retry.Id != added.Id || retry.Quantity != added.Quantity {
		t.Fatalf("CLI idempotency: %#v", retry)
	}
	items := &shoppingv1.ListItemsResponse{}
	runCLI(t, ctx, client, items, "--json", "items", "--list", itoa(listID), "--query", "potato")
	if items.Total != 1 || items.Items[0].PreferredStore != "Co-op" {
		t.Fatalf("CLI items: %#v", items)
	}
	done := &shoppingv1.Item{}
	runCLI(t, ctx, client, done, "--json", "complete", "--version", itoa(added.Version), itoa(added.Id))
	if done.Status != shoppingv1.ItemStatus_ITEM_STATUS_COMPLETED {
		t.Fatalf("CLI complete: %#v", done)
	}
	summary := &shoppingv1.Summary{}
	runCLI(t, ctx, client, summary, "--json", "summary", "--list", itoa(listID))
	if summary.ActiveCount != 0 || summary.CompletedCount != 1 {
		t.Fatalf("CLI summary: %#v", summary)
	}
	exported := &shoppingv1.ExportDataResponse{}
	runCLI(t, ctx, client, exported, "--json", "export")
	if exported.MediaType != "application/json" || !json.Valid(exported.Data) {
		t.Fatalf("CLI export invalid: %#v", exported)
	}
}

func TestCLIReportsUsageAndProtocolErrors(t *testing.T) {
	client := harness(t)
	var out, stderr bytes.Buffer
	r := cli.Runner{Client: client, Out: &out, Err: &stderr}
	if code := r.Run(context.Background(), []string{"add"}); code != 1 || !strings.Contains(stderr.String(), "requires an item name") {
		t.Fatalf("bad CLI error: code=%d stderr=%q", code, stderr.String())
	}
	stderr.Reset()
	if code := r.Run(context.Background(), []string{"--server", baseURL, "unknown"}); code != 2 || !strings.Contains(stderr.String(), "unknown command") {
		t.Fatalf("bad usage: code=%d stderr=%q", code, stderr.String())
	}
}

func runCLI(t *testing.T, ctx context.Context, client *http.Client, dst proto.Message, args ...string) {
	t.Helper()
	args = append([]string{"--server", baseURL}, args...)
	var out, stderr bytes.Buffer
	code := (cli.Runner{Client: client, Out: &out, Err: &stderr}).Run(ctx, args)
	if code != 0 {
		t.Fatalf("CLI %v failed (%d): %s", args, code, stderr.String())
	}
	if err := protojson.Unmarshal(out.Bytes(), dst); err != nil {
		t.Fatalf("decode CLI output %q: %v", out.String(), err)
	}
}
func rawCall(t *testing.T, ctx context.Context, client *http.Client, method string, body any, dst proto.Message, want int, origin string) {
	t.Helper()
	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/shopping.v1.ShoppingService/"+method, bytes.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Connect-Protocol-Version", "1")
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != want {
		t.Fatalf("%s status=%d want=%d body=%s", method, resp.StatusCode, want, data)
	}
	if dst != nil && want == http.StatusOK {
		if err = protojson.Unmarshal(data, dst); err != nil {
			t.Fatalf("decode %s response %q: %v", method, data, err)
		}
	}
}
func itoa(v int64) string { return strconv.FormatInt(v, 10) }
