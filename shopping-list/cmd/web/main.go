//go:build js && wasm

package main

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"syscall/js"

	"connectrpc.com/connect"
	shoppingv1 "github.com/example/shopping-list/gen/shopping/v1"
	shoppingv1connect "github.com/example/shopping-list/gen/shopping/v1/shoppingv1connect"
	"github.com/maxence-charriere/go-app/v10/pkg/app"
)

type basket struct {
	app.Compo
	client                                                      shoppingv1connect.ShoppingServiceClient
	lists                                                       []*shoppingv1.ShoppingList
	items                                                       []*shoppingv1.Item
	suggestions                                                 []*shoppingv1.Suggestion
	discounts                                                   []*shoppingv1.Discount
	summary                                                     *shoppingv1.Summary
	listID                                                      int64
	refreshSeq                                                  int
	name, quantity, unit, store, category, note, query, newList string
	showCompleted, busy                                         bool
	err                                                         string
}

func (b *basket) OnMount(ctx app.Context) {
	origin := js.Global().Get("location").Get("origin").String()
	b.client = shoppingv1connect.NewShoppingServiceClient(http.DefaultClient, origin)
	b.quantity = "1"
	b.loadLists(ctx)
}
func (b *basket) loadLists(ctx app.Context) {
	b.busy = true
	ctx.Async(func() {
		res, err := b.client.ListLists(context.Background(), connect.NewRequest(&shoppingv1.ListListsRequest{}))
		ctx.Dispatch(func(ctx app.Context) {
			b.busy = false
			if err != nil {
				b.err = err.Error()
				return
			}
			b.lists = res.Msg.Lists
			if b.listID == 0 {
				for _, v := range b.lists {
					if v.IsDefault {
						b.listID = v.Id
						break
					}
				}
				if b.listID == 0 && len(b.lists) > 0 {
					b.listID = b.lists[0].Id
				}
			}
			b.refresh(ctx)
		})
	})
}
func (b *basket) refresh(ctx app.Context) {
	if b.listID == 0 {
		return
	}
	b.busy = true
	b.refreshSeq++
	seq := b.refreshSeq
	listID := b.listID
	statuses := []shoppingv1.ItemStatus{shoppingv1.ItemStatus_ITEM_STATUS_ACTIVE}
	if b.showCompleted {
		statuses = append(statuses, shoppingv1.ItemStatus_ITEM_STATUS_COMPLETED)
	}
	query := b.query
	ctx.Async(func() {
		items, err := b.client.ListItems(context.Background(), connect.NewRequest(&shoppingv1.ListItemsRequest{ListId: listID, Statuses: statuses, Query: query, Limit: 500}))
		if err != nil {
			ctx.Dispatch(func(app.Context) { b.busy = false; b.err = err.Error() })
			return
		}
		summary, err := b.client.GetSummary(context.Background(), connect.NewRequest(&shoppingv1.GetSummaryRequest{ListId: listID}))
		ctx.Dispatch(func(app.Context) {
			if seq != b.refreshSeq {
				return
			}
			b.busy = false
			if err != nil {
				b.err = err.Error()
				return
			}
			b.err = ""
			b.items = items.Msg.Items
			b.summary = summary.Msg
		})
	})
}
func (b *basket) add(ctx app.Context, e app.Event) {
	e.PreventDefault()
	q, err := strconv.ParseFloat(strings.TrimSpace(b.quantity), 64)
	if err != nil || q <= 0 {
		b.err = "Quantity must be greater than zero"
		return
	}
	req := &shoppingv1.AddItemRequest{ListId: b.listID, Name: b.name, Quantity: q, Unit: b.unit, PreferredStore: b.store, Category: b.category, Note: b.note, Priority: shoppingv1.Priority_PRIORITY_NORMAL, MergeDuplicate: true}
	ctx.Async(func() {
		_, err := b.client.AddItem(context.Background(), connect.NewRequest(req))
		ctx.Dispatch(func(ctx app.Context) {
			if err != nil {
				b.err = err.Error()
				return
			}
			b.name = ""
			b.note = ""
			b.quantity = "1"
			b.refresh(ctx)
		})
	})
}
func (b *basket) createList(ctx app.Context, e app.Event) {
	e.PreventDefault()
	name := strings.TrimSpace(b.newList)
	if name == "" {
		return
	}
	ctx.Async(func() {
		res, err := b.client.CreateList(context.Background(), connect.NewRequest(&shoppingv1.CreateListRequest{Name: name, Color: "#367447"}))
		ctx.Dispatch(func(ctx app.Context) {
			if err != nil {
				b.err = err.Error()
				return
			}
			b.newList = ""
			b.listID = res.Msg.Id
			b.loadLists(ctx)
		})
	})
}
func (b *basket) selectList(ctx app.Context, e app.Event) {
	id, _ := strconv.ParseInt(ctx.JSSrc().Get("dataset").Get("id").String(), 10, 64)
	b.listID = id
	b.refresh(ctx)
}
func (b *basket) setStatus(ctx app.Context, e app.Event) {
	target := e.JSValue().Get("currentTarget").Get("dataset")
	id, _ := strconv.ParseInt(target.Get("id").String(), 10, 64)
	version, _ := strconv.ParseInt(target.Get("version").String(), 10, 64)
	current, _ := strconv.Atoi(target.Get("status").String())
	next := shoppingv1.ItemStatus_ITEM_STATUS_COMPLETED
	if shoppingv1.ItemStatus(current) == next {
		next = shoppingv1.ItemStatus_ITEM_STATUS_ACTIVE
	}
	ctx.Async(func() {
		_, err := b.client.SetItemStatus(context.Background(), connect.NewRequest(&shoppingv1.SetItemStatusRequest{Id: id, ExpectedVersion: version, Status: next}))
		ctx.Dispatch(func(ctx app.Context) {
			if err != nil {
				b.err = err.Error()
				b.refresh(ctx)
				return
			}
			b.refresh(ctx)
		})
	})
}
func (b *basket) archive(ctx app.Context, e app.Event) {
	target := e.JSValue().Get("currentTarget").Get("dataset")
	id, _ := strconv.ParseInt(target.Get("id").String(), 10, 64)
	version, _ := strconv.ParseInt(target.Get("version").String(), 10, 64)
	ctx.Async(func() {
		_, err := b.client.DeleteItem(context.Background(), connect.NewRequest(&shoppingv1.DeleteItemRequest{Id: id, ExpectedVersion: version}))
		ctx.Dispatch(func(ctx app.Context) {
			if err != nil {
				b.err = err.Error()
				return
			}
			b.refresh(ctx)
		})
	})
}
func (b *basket) suggest(ctx app.Context, e app.Event) {
	ctx.Async(func() {
		res, err := b.client.GetSuggestions(context.Background(), connect.NewRequest(&shoppingv1.GetSuggestionsRequest{Limit: 6, ListId: b.listID}))
		ctx.Dispatch(func(app.Context) {
			if err != nil {
				b.err = err.Error()
				return
			}
			b.suggestions = res.Msg.Suggestions
		})
	})
}
func (b *basket) findDeals(ctx app.Context, e app.Event) {
	products := make([]string, 0, len(b.items))
	for _, i := range b.items {
		if i.Status == shoppingv1.ItemStatus_ITEM_STATUS_ACTIVE && len(products) < 100 {
			products = append(products, i.Name)
		}
	}
	ctx.Async(func() {
		res, err := b.client.SearchDiscounts(context.Background(), connect.NewRequest(&shoppingv1.SearchDiscountsRequest{Products: products}))
		ctx.Dispatch(func(app.Context) {
			if err != nil {
				b.err = err.Error()
				return
			}
			b.discounts = res.Msg.Discounts
		})
	})
}

func (b *basket) Render() app.UI {
	return app.Main().Class("min-h-screen bg-paper px-4 py-8 text-ink sm:px-8").Body(app.Div().Class("mx-auto grid max-w-6xl gap-8 lg:grid-cols-[15rem_1fr]").Body(
		app.Aside().Class("space-y-5").Body(app.Div().Body(app.P().Class("text-xs font-black uppercase tracking-[.25em] text-leaf-600").Text("Personal pantry"), app.H1().Class("mt-1 text-4xl font-black").Text("Basket")), app.Nav().Class("space-y-2").Body(b.listUIs()...), app.Form().Class("flex gap-2").OnSubmit(b.createList).Body(app.Input().Class(inputClass+" min-w-0").Placeholder("New list").Value(b.newList).OnInput(bind(&b.newList)), app.Button().Class("rounded-xl bg-ink px-3 text-white").Text("+"))),
		app.Div().Body(b.header(), b.addForm(), b.errorUI(), app.Section().Class("mt-6 space-y-3").Body(b.itemUIs()...), app.Section().Class("mt-8 rounded-3xl bg-ink p-6 text-white").Body(app.Div().Class("flex flex-wrap items-center justify-between gap-4").Body(app.Div().Body(app.H2().Class("text-xl font-bold").Text("Smart restock"), app.P().Class("text-sm text-white/60").Text("Explainable suggestions and source-linked offers.")), app.Div().Class("flex gap-2").Body(app.Button().Class("rounded-xl bg-white/15 px-4 py-2 font-bold").OnClick(b.findDeals).Text("Find deals"), app.Button().Class("rounded-xl bg-white px-4 py-2 font-bold text-ink").OnClick(b.suggest).Text("Suggest"))), app.Div().Class("mt-5 grid gap-3 sm:grid-cols-2").Body(append(b.suggestionUIs(), b.discountUIs()...)...))),
	))
}

const inputClass = "rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-leaf-600"

func bind(dst *string) func(app.Context, app.Event) {
	return func(ctx app.Context, e app.Event) { *dst = ctx.JSSrc().Get("value").String() }
}
func (b *basket) header() app.UI {
	name := "Shopping list"
	for _, v := range b.lists {
		if v.Id == b.listID {
			name = v.Name
		}
	}
	active, done, total := int64(0), int64(0), "—"
	if b.summary != nil {
		active = b.summary.ActiveCount
		done = b.summary.CompletedCount
		if len(b.summary.EstimatedTotals) == 1 {
			m := b.summary.EstimatedTotals[0]
			total = fmt.Sprintf("%.2f %s", float64(m.MinorUnits)/100, m.Currency)
		} else if len(b.summary.EstimatedTotals) > 1 {
			total = "multiple currencies"
		}
	}
	return app.Header().Class("mb-5").Body(app.Div().Class("flex flex-wrap items-end justify-between gap-4").Body(app.Div().Body(app.H2().Class("text-4xl font-black").Text(name), app.P().Class("mt-1 text-sm text-slate-500").Text(fmt.Sprintf("%d remaining · %d bought · %s estimated", active, done, total))), app.Label().Class("flex items-center gap-2 text-sm").Body(app.Input().Type("checkbox").Checked(b.showCompleted).OnChange(func(ctx app.Context, e app.Event) {
		b.showCompleted = ctx.JSSrc().Get("checked").Bool()
		b.refresh(ctx)
	}), app.Text("Show bought"))), app.Input().Class(inputClass+" mt-4 w-full").Placeholder("Search item names and notes…").Value(b.query).OnInput(func(ctx app.Context, e app.Event) { b.query = ctx.JSSrc().Get("value").String(); b.refresh(ctx) }))
}
func (b *basket) addForm() app.UI {
	return app.Form().Class("grid gap-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:grid-cols-6").OnSubmit(b.add).Body(app.Input().Class(inputClass+" sm:col-span-3").Placeholder("Item name").Value(b.name).OnInput(bind(&b.name)), app.Input().Class(inputClass).Placeholder("Qty").Value(b.quantity).OnInput(bind(&b.quantity)), app.Input().Class(inputClass).Placeholder("Unit").Value(b.unit).OnInput(bind(&b.unit)), app.Input().Class(inputClass+" sm:col-span-2").Placeholder("Store").Value(b.store).OnInput(bind(&b.store)), app.Input().Class(inputClass+" sm:col-span-2").Placeholder("Category").Value(b.category).OnInput(bind(&b.category)), app.Input().Class(inputClass+" sm:col-span-4").Placeholder("Note, brand, size, substitutions…").Value(b.note).OnInput(bind(&b.note)), app.Button().Class("rounded-xl bg-leaf-600 px-6 py-3 font-bold text-white sm:col-span-2").Text("Add or merge"))
}
func (b *basket) listUIs() []app.UI {
	out := make([]app.UI, 0, len(b.lists))
	for _, v := range b.lists {
		class := "w-full rounded-xl px-3 py-2 text-left font-semibold hover:bg-white"
		if v.Id == b.listID {
			class += " bg-white shadow-sm"
		}
		out = append(out, app.Button().Class(class).DataSet("id", fmt.Sprint(v.Id)).OnClick(b.selectList).Text(v.Name))
	}
	return out
}
func (b *basket) errorUI() app.UI {
	if b.err == "" {
		return app.Div()
	}
	return app.P().Class("mt-4 rounded-xl bg-red-50 p-3 text-red-700").Text(b.err)
}
func (b *basket) itemUIs() []app.UI {
	if b.busy && len(b.items) == 0 {
		return []app.UI{app.P().Class("py-12 text-center text-slate-400").Text("Loading…")}
	}
	if len(b.items) == 0 {
		return []app.UI{app.P().Class("py-12 text-center text-slate-500").Text("Nothing here. Add an item or adjust the filters.")}
	}
	out := make([]app.UI, 0, len(b.items))
	for _, i := range b.items {
		done := i.Status == shoppingv1.ItemStatus_ITEM_STATUS_COMPLETED
		nameClass := "font-bold"
		if done {
			nameClass += " line-through text-slate-400"
		}
		meta := strings.Join(nonempty(i.Category, i.PreferredStore, quantityLabel(i)), " · ")
		out = append(out, app.Article().Class("group flex items-start gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5").Body(app.Button().Class("mt-1 h-6 w-6 shrink-0 rounded-full border-2 border-leaf-600 data-[done=true]:bg-leaf-600").DataSet("id", fmt.Sprint(i.Id)).DataSet("version", fmt.Sprint(i.Version)).DataSet("status", fmt.Sprint(int32(i.Status))).DataSet("done", fmt.Sprint(done)).OnClick(b.setStatus).Aria("label", "Toggle "+i.Name), app.Div().Class("min-w-0 flex-1").Body(app.P().Class(nameClass).Text(i.Name), app.P().Class("text-sm text-slate-500").Text(meta), app.P().Class("mt-1 text-sm text-slate-600").Text(i.Note)), app.Button().Class("rounded-lg px-2 py-1 text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100").DataSet("id", fmt.Sprint(i.Id)).DataSet("version", fmt.Sprint(i.Version)).OnClick(b.archive).Aria("label", "Archive "+i.Name).Text("×")))
	}
	return out
}
func (b *basket) suggestionUIs() []app.UI {
	out := make([]app.UI, 0, len(b.suggestions))
	for _, s := range b.suggestions {
		out = append(out, app.Div().Class("rounded-xl bg-white/10 p-4").Body(app.P().Class("font-bold").Text(s.Name), app.P().Class("mt-1 text-sm text-white/65").Text(s.Reason)))
	}
	return out
}
func (b *basket) discountUIs() []app.UI {
	out := make([]app.UI, 0, len(b.discounts))
	for _, d := range b.discounts {
		out = append(out, app.A().Class("block rounded-xl bg-leaf-600 p-4 hover:brightness-110").Href(d.SourceUrl).Target("_blank").Body(app.P().Class("font-bold").Text(d.Product+" · "+d.Price), app.P().Class("mt-1 text-sm text-white/75").Text(d.Store)))
	}
	return out
}
func quantityLabel(i *shoppingv1.Item) string {
	q := strconv.FormatFloat(i.Quantity, 'f', -1, 64)
	if i.Unit != "" {
		q += " " + i.Unit
	}
	return q
}
func nonempty(v ...string) []string {
	out := make([]string, 0, len(v))
	for _, x := range v {
		if strings.TrimSpace(x) != "" {
			out = append(out, x)
		}
	}
	return out
}
func main() { app.Route("/", func() app.Composer { return &basket{} }); app.RunWhenOnBrowser() }
