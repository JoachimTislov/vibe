// Package cli implements the command-line client for Basket's ConnectRPC API.
package cli

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"connectrpc.com/connect"
	shoppingv1 "github.com/example/shopping-list/gen/shopping/v1"
	shoppingv1connect "github.com/example/shopping-list/gen/shopping/v1/shoppingv1connect"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

type Runner struct {
	Client   *http.Client
	Out, Err io.Writer
}

func (r Runner) Run(ctx context.Context, args []string) int {
	if r.Out == nil {
		r.Out = io.Discard
	}
	if r.Err == nil {
		r.Err = io.Discard
	}
	if r.Client == nil {
		r.Client = &http.Client{Timeout: 30 * time.Second}
	}
	root := flag.NewFlagSet("shopping-list", flag.ContinueOnError)
	root.SetOutput(r.Err)
	server := root.String("server", "http://127.0.0.1:8080", "Basket server URL")
	asJSON := root.Bool("json", false, "print JSON")
	if err := root.Parse(args); err != nil {
		return 2
	}
	rest := root.Args()
	if len(rest) == 0 {
		r.usage()
		return 2
	}
	client := shoppingv1connect.NewShoppingServiceClient(r.Client, strings.TrimRight(*server, "/"))
	var msg proto.Message
	var err error
	switch rest[0] {
	case "lists":
		msg, err = listLists(ctx, client, rest[1:], r.Err)
	case "create-list":
		msg, err = createList(ctx, client, rest[1:], r.Err)
	case "items":
		msg, err = listItems(ctx, client, rest[1:], r.Err)
	case "add":
		msg, err = addItem(ctx, client, rest[1:], r.Err)
	case "complete":
		msg, err = setStatus(ctx, client, rest[1:], shoppingv1.ItemStatus_ITEM_STATUS_COMPLETED, r.Err)
	case "restore":
		msg, err = setStatus(ctx, client, rest[1:], shoppingv1.ItemStatus_ITEM_STATUS_ACTIVE, r.Err)
	case "archive":
		msg, err = archive(ctx, client, rest[1:], r.Err)
	case "summary":
		msg, err = summary(ctx, client, rest[1:], r.Err)
	case "suggest":
		msg, err = suggest(ctx, client, rest[1:], r.Err)
	case "deals":
		msg, err = deals(ctx, client, rest[1:], r.Err)
	case "export":
		msg, err = exportData(ctx, client, rest[1:], r.Err)
	case "help", "-h", "--help":
		r.usage()
		return 0
	default:
		fmt.Fprintf(r.Err, "unknown command %q\n", rest[0])
		r.usage()
		return 2
	}
	if err != nil {
		fmt.Fprintf(r.Err, "error: %v\n", err)
		return 1
	}
	if err = writeMessage(r.Out, msg, *asJSON); err != nil {
		fmt.Fprintf(r.Err, "error: %v\n", err)
		return 1
	}
	return 0
}
func (r Runner) usage() {
	fmt.Fprintln(r.Err, "usage: shopping-list [--server URL] [--json] <lists|create-list|items|add|complete|restore|archive|summary|suggest|deals|export> [options]")
}

func listLists(ctx context.Context, c shoppingv1connect.ShoppingServiceClient, args []string, stderr io.Writer) (proto.Message, error) {
	fs := flags("lists", stderr)
	all := fs.Bool("all", false, "include archived")
	if err := fs.Parse(args); err != nil {
		return nil, err
	}
	res, err := c.ListLists(ctx, connect.NewRequest(&shoppingv1.ListListsRequest{IncludeArchived: *all}))
	if err != nil {
		return nil, err
	}
	return res.Msg, nil
}
func createList(ctx context.Context, c shoppingv1connect.ShoppingServiceClient, args []string, stderr io.Writer) (proto.Message, error) {
	fs := flags("create-list", stderr)
	description := fs.String("description", "", "description")
	color := fs.String("color", "#367447", "color")
	def := fs.Bool("default", false, "make default")
	key := fs.String("request-id", "", "idempotency key")
	if err := fs.Parse(args); err != nil {
		return nil, err
	}
	if fs.NArg() != 1 {
		return nil, errors.New("create-list requires a name")
	}
	res, err := c.CreateList(ctx, connect.NewRequest(&shoppingv1.CreateListRequest{Name: fs.Arg(0), Description: *description, Color: *color, MakeDefault: *def, IdempotencyKey: *key}))
	if err != nil {
		return nil, err
	}
	return res.Msg, nil
}
func listItems(ctx context.Context, c shoppingv1connect.ShoppingServiceClient, args []string, stderr io.Writer) (proto.Message, error) {
	fs := flags("items", stderr)
	list := fs.Int64("list", 0, "list ID")
	all := fs.Bool("all", false, "include completed")
	archived := fs.Bool("archived", false, "show archived only")
	query := fs.String("query", "", "search")
	store := fs.String("store", "", "store filter")
	category := fs.String("category", "", "category filter")
	limit := fs.Int("limit", 100, "page size")
	offset := fs.Int("offset", 0, "page offset")
	if err := fs.Parse(args); err != nil {
		return nil, err
	}
	statuses := []shoppingv1.ItemStatus{shoppingv1.ItemStatus_ITEM_STATUS_ACTIVE}
	if *all {
		statuses = append(statuses, shoppingv1.ItemStatus_ITEM_STATUS_COMPLETED)
	}
	if *archived {
		statuses = []shoppingv1.ItemStatus{shoppingv1.ItemStatus_ITEM_STATUS_ARCHIVED}
	}
	res, err := c.ListItems(ctx, connect.NewRequest(&shoppingv1.ListItemsRequest{ListId: *list, Statuses: statuses, Query: *query, Store: *store, Category: *category, Limit: int32(*limit), Offset: int32(*offset)}))
	if err != nil {
		return nil, err
	}
	return res.Msg, nil
}
func addItem(ctx context.Context, c shoppingv1connect.ShoppingServiceClient, args []string, stderr io.Writer) (proto.Message, error) {
	fs := flags("add", stderr)
	list := fs.Int64("list", 0, "list ID")
	qty := fs.Float64("qty", 1, "quantity")
	unit := fs.String("unit", "", "unit")
	store := fs.String("store", "", "preferred store")
	category := fs.String("category", "", "category")
	note := fs.String("note", "", "note")
	merge := fs.Bool("merge", false, "merge duplicate")
	key := fs.String("request-id", "", "idempotency key")
	if err := fs.Parse(args); err != nil {
		return nil, err
	}
	if fs.NArg() != 1 {
		return nil, errors.New("add requires an item name")
	}
	res, err := c.AddItem(ctx, connect.NewRequest(&shoppingv1.AddItemRequest{ListId: *list, Name: fs.Arg(0), Quantity: *qty, Unit: *unit, PreferredStore: *store, Category: *category, Note: *note, Priority: shoppingv1.Priority_PRIORITY_NORMAL, MergeDuplicate: *merge, IdempotencyKey: *key}))
	if err != nil {
		return nil, err
	}
	return res.Msg, nil
}
func setStatus(ctx context.Context, c shoppingv1connect.ShoppingServiceClient, args []string, status shoppingv1.ItemStatus, stderr io.Writer) (proto.Message, error) {
	fs := flags("status", stderr)
	version := fs.Int64("version", 0, "expected version")
	store := fs.String("store", "", "actual store")
	if err := fs.Parse(args); err != nil {
		return nil, err
	}
	id, err := oneID(fs)
	if err != nil {
		return nil, err
	}
	res, err := c.SetItemStatus(ctx, connect.NewRequest(&shoppingv1.SetItemStatusRequest{Id: id, Status: status, ExpectedVersion: *version, ActualStore: *store}))
	if err != nil {
		return nil, err
	}
	return res.Msg, nil
}
func archive(ctx context.Context, c shoppingv1connect.ShoppingServiceClient, args []string, stderr io.Writer) (proto.Message, error) {
	fs := flags("archive", stderr)
	version := fs.Int64("version", 0, "expected version")
	if err := fs.Parse(args); err != nil {
		return nil, err
	}
	id, err := oneID(fs)
	if err != nil {
		return nil, err
	}
	res, err := c.DeleteItem(ctx, connect.NewRequest(&shoppingv1.DeleteItemRequest{Id: id, ExpectedVersion: *version}))
	if err != nil {
		return nil, err
	}
	return res.Msg, nil
}
func summary(ctx context.Context, c shoppingv1connect.ShoppingServiceClient, args []string, stderr io.Writer) (proto.Message, error) {
	fs := flags("summary", stderr)
	list := fs.Int64("list", 0, "list ID")
	if err := fs.Parse(args); err != nil {
		return nil, err
	}
	res, err := c.GetSummary(ctx, connect.NewRequest(&shoppingv1.GetSummaryRequest{ListId: *list}))
	if err != nil {
		return nil, err
	}
	return res.Msg, nil
}
func suggest(ctx context.Context, c shoppingv1connect.ShoppingServiceClient, args []string, stderr io.Writer) (proto.Message, error) {
	fs := flags("suggest", stderr)
	list := fs.Int64("list", 0, "list ID")
	limit := fs.Int("limit", 8, "maximum suggestions")
	if err := fs.Parse(args); err != nil {
		return nil, err
	}
	res, err := c.GetSuggestions(ctx, connect.NewRequest(&shoppingv1.GetSuggestionsRequest{ListId: *list, Limit: int32(*limit)}))
	if err != nil {
		return nil, err
	}
	return res.Msg, nil
}
func deals(ctx context.Context, c shoppingv1connect.ShoppingServiceClient, args []string, stderr io.Writer) (proto.Message, error) {
	if len(args) == 0 {
		return nil, errors.New("deals requires one or more product names")
	}
	res, err := c.SearchDiscounts(ctx, connect.NewRequest(&shoppingv1.SearchDiscountsRequest{Products: args}))
	if err != nil {
		return nil, err
	}
	return res.Msg, nil
}
func exportData(ctx context.Context, c shoppingv1connect.ShoppingServiceClient, args []string, stderr io.Writer) (proto.Message, error) {
	if len(args) != 0 {
		return nil, errors.New("export takes no arguments")
	}
	res, err := c.ExportData(ctx, connect.NewRequest(&shoppingv1.ExportDataRequest{}))
	if err != nil {
		return nil, err
	}
	return res.Msg, nil
}
func flags(name string, w io.Writer) *flag.FlagSet {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	fs.SetOutput(w)
	return fs
}
func oneID(fs *flag.FlagSet) (int64, error) {
	if fs.NArg() != 1 {
		return 0, errors.New("command requires one numeric item ID")
	}
	id, err := strconv.ParseInt(fs.Arg(0), 10, 64)
	if err != nil || id <= 0 {
		return 0, errors.New("item ID must be a positive integer")
	}
	return id, nil
}
func writeMessage(w io.Writer, msg proto.Message, asJSON bool) error {
	if msg == nil {
		return nil
	}
	if asJSON {
		b, err := protojson.MarshalOptions{Indent: "  ", UseProtoNames: true}.Marshal(msg)
		if err != nil {
			return err
		}
		_, err = fmt.Fprintln(w, string(b))
		return err
	}
	b, err := json.MarshalIndent(msg, "", "  ")
	if err != nil {
		return err
	}
	_, err = fmt.Fprintln(w, string(b))
	return err
}
