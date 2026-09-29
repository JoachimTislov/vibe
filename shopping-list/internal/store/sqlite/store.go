// Package sqlite persists shopping lists and purchase history.
package sqlite

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"math"
	"net/url"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/example/shopping-list/internal/domain"
	"golang.org/x/text/cases"
	"golang.org/x/text/unicode/norm"
	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrations embed.FS

type Store struct{ db *sql.DB }

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}
func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	if _, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		return fmt.Errorf("create migration table: %w", err)
	}
	entries, err := migrations.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
			continue
		}
		version := strings.TrimSuffix(entry.Name(), ".sql")
		var exists int
		if err = s.db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version=?`, version).Scan(&exists); err != nil {
			return err
		}
		if exists > 0 {
			continue
		}
		body, e := migrations.ReadFile("migrations/" + entry.Name())
		if e != nil {
			return e
		}
		tx, e := s.db.Begin()
		if e != nil {
			return e
		}
		if _, e = tx.Exec(string(body)); e == nil {
			_, e = tx.Exec(`INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)`, version, time.Now().UTC().Format(time.RFC3339Nano))
		}
		if e != nil {
			_ = tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", version, e)
		}
		if e = tx.Commit(); e != nil {
			return e
		}
	}
	return nil
}

func (s *Store) ListLists(ctx context.Context, includeArchived bool) ([]domain.ShoppingList, error) {
	q := `SELECT id,name,description,color,is_default,archived,version,created_at,updated_at FROM shopping_lists`
	if !includeArchived {
		q += ` WHERE archived=0`
	}
	q += ` ORDER BY is_default DESC,name COLLATE NOCASE`
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list lists: %w", err)
	}
	defer rows.Close()
	var out []domain.ShoppingList
	for rows.Next() {
		v, e := scanList(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *Store) CreateList(ctx context.Context, v domain.ShoppingList, key string) (domain.ShoppingList, error) {
	v.Name = strings.TrimSpace(v.Name)
	if err := validateText("list name", v.Name, 1, 120); err != nil {
		return v, err
	}
	if err := validateText("description", v.Description, 0, 1000); err != nil {
		return v, err
	}
	if v.Color == "" {
		v.Color = "#367447"
	}
	now := time.Now().UTC()
	v.CreatedAt = now
	v.UpdatedAt = now
	v.Version = 1
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return v, err
	}
	defer tx.Rollback()
	if key != "" {
		if existing, e := getListByKey(ctx, tx, key); e == nil {
			return existing, nil
		} else if !errors.Is(e, sql.ErrNoRows) {
			return v, e
		}
	}
	if v.Default {
		if _, err = tx.ExecContext(ctx, `UPDATE shopping_lists SET is_default=0`); err != nil {
			return v, err
		}
	}
	r, err := tx.ExecContext(ctx, `INSERT INTO shopping_lists(name,description,color,is_default,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, v.Name, v.Description, v.Color, v.Default, nullString(key), formatTime(now), formatTime(now))
	if err != nil {
		return v, mapConstraint(err)
	}
	v.ID, err = r.LastInsertId()
	if err != nil {
		return v, err
	}
	return v, tx.Commit()
}
func (s *Store) UpdateList(ctx context.Context, v domain.ShoppingList, makeDefault bool) (domain.ShoppingList, error) {
	v.Name = strings.TrimSpace(v.Name)
	if err := validateText("list name", v.Name, 1, 120); err != nil {
		return v, err
	}
	if v.Version <= 0 {
		return v, fmt.Errorf("%w: expected version is required", domain.ErrInvalid)
	}
	now := time.Now().UTC()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return v, err
	}
	defer tx.Rollback()
	existing, err := getList(ctx, tx, v.ID)
	if err != nil {
		return v, err
	}
	if existing.Version != v.Version {
		return v, domain.ErrConflict
	}
	if v.Archived && !existing.Archived {
		var active int64
		if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM items WHERE list_id=? AND status=1`, v.ID).Scan(&active); err != nil {
			return v, err
		}
		if active > 0 {
			return v, domain.ErrListNotEmpty
		}
		if existing.Default {
			var replacement int64
			if err = tx.QueryRowContext(ctx, `SELECT id FROM shopping_lists WHERE id<>? AND archived=0 ORDER BY created_at LIMIT 1`, v.ID).Scan(&replacement); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return v, fmt.Errorf("%w: cannot archive the only active list", domain.ErrInvalid)
				}
				return v, err
			}
			if _, err = tx.ExecContext(ctx, `UPDATE shopping_lists SET is_default=1,version=version+1,updated_at=? WHERE id=?`, formatTime(now), replacement); err != nil {
				return v, err
			}
		}
	}
	if makeDefault {
		if _, err = tx.ExecContext(ctx, `UPDATE shopping_lists SET is_default=0 WHERE id<>?`, v.ID); err != nil {
			return v, err
		}
	}
	r, err := tx.ExecContext(ctx, `UPDATE shopping_lists SET name=?,description=?,color=?,archived=?,is_default=CASE WHEN ? THEN 0 WHEN ? THEN 1 ELSE is_default END,version=version+1,updated_at=? WHERE id=? AND version=?`, v.Name, v.Description, v.Color, v.Archived, v.Archived, makeDefault, formatTime(now), v.ID, v.Version)
	if err != nil {
		return v, err
	}
	n, _ := r.RowsAffected()
	if n == 0 {
		return v, domain.ErrConflict
	}
	out, err := getList(ctx, tx, v.ID)
	if err != nil {
		return v, err
	}
	return out, tx.Commit()
}

func (s *Store) ListItems(ctx context.Context, f domain.ItemFilter) ([]domain.Item, int64, error) {
	where, args := itemWhere(f)
	var total int64
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM items`+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	limit := f.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	args = append(args, limit, max(f.Offset, 0))
	rows, err := s.db.QueryContext(ctx, itemSelect+where+` ORDER BY status,priority DESC,position,created_at DESC LIMIT ? OFFSET ?`, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list items: %w", err)
	}
	defer rows.Close()
	var out []domain.Item
	for rows.Next() {
		i, e := scanItem(rows)
		if e != nil {
			return nil, 0, e
		}
		out = append(out, i)
	}
	return out, total, rows.Err()
}
func (s *Store) AddItem(ctx context.Context, i domain.Item, opts domain.AddOptions) (domain.Item, error) {
	if err := prepareItem(&i); err != nil {
		return i, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return i, err
	}
	defer tx.Rollback()
	if i.ListID == 0 {
		if err = tx.QueryRowContext(ctx, `SELECT id FROM shopping_lists WHERE is_default=1 AND archived=0 LIMIT 1`).Scan(&i.ListID); err != nil {
			return i, err
		}
	}
	if opts.IdempotencyKey != "" {
		if existing, e := getItemByKey(ctx, tx, opts.IdempotencyKey); e == nil {
			return existing, nil
		} else if !errors.Is(e, sql.ErrNoRows) {
			return i, e
		}
	}
	if opts.MergeDuplicate {
		existing, e := findDuplicate(ctx, tx, i)
		if e == nil {
			_, e = tx.ExecContext(ctx, `UPDATE items SET quantity=quantity+?,version=version+1,updated_at=? WHERE id=?`, i.Quantity, formatTime(i.UpdatedAt), existing.ID)
			if e != nil {
				return i, e
			}
			out, e := getItem(ctx, tx, existing.ID)
			if e != nil {
				return i, e
			}
			return out, tx.Commit()
		} else if !errors.Is(e, sql.ErrNoRows) {
			return i, e
		}
	}
	var listOK int
	if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM shopping_lists WHERE id=? AND archived=0`, i.ListID).Scan(&listOK); err != nil || listOK == 0 {
		return i, fmt.Errorf("%w: list does not exist or is archived", domain.ErrInvalid)
	}
	r, err := tx.ExecContext(ctx, `INSERT INTO items(name,quantity,unit,preferred_store,completed,created_at,list_id,normalized_name,category,note,priority,status,estimated_unit_price_minor,currency,barcode,image_url,position,version,due_at,updated_at,idempotency_key) VALUES(?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`, i.Name, i.Quantity, i.Unit, i.PreferredStore, formatTime(i.CreatedAt), i.ListID, i.NormalizedName, i.Category, i.Note, i.Priority, i.Status, i.EstimatedUnitPrice.MinorUnits, i.EstimatedUnitPrice.Currency, i.Barcode, i.ImageURL, i.Position, nullTime(i.DueAt), formatTime(i.UpdatedAt), nullString(opts.IdempotencyKey))
	if err != nil {
		return i, mapConstraint(err)
	}
	i.ID, err = r.LastInsertId()
	if err != nil {
		return i, err
	}
	return i, tx.Commit()
}
func (s *Store) UpdateItem(ctx context.Context, i domain.Item) (domain.Item, error) {
	if i.Version <= 0 {
		return i, fmt.Errorf("%w: expected version is required", domain.ErrInvalid)
	}
	if err := prepareItem(&i); err != nil {
		return i, err
	}
	r, err := s.db.ExecContext(ctx, `UPDATE items SET name=?,normalized_name=?,quantity=?,unit=?,preferred_store=?,category=?,note=?,priority=?,estimated_unit_price_minor=?,currency=?,barcode=?,image_url=?,position=?,due_at=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status<>3`, i.Name, i.NormalizedName, i.Quantity, i.Unit, i.PreferredStore, i.Category, i.Note, i.Priority, i.EstimatedUnitPrice.MinorUnits, i.EstimatedUnitPrice.Currency, i.Barcode, i.ImageURL, i.Position, nullTime(i.DueAt), formatTime(i.UpdatedAt), i.ID, i.Version)
	if err != nil {
		return i, mapConstraint(err)
	}
	n, _ := r.RowsAffected()
	if n == 0 {
		return i, domain.ErrConflict
	}
	return getItem(ctx, s.db, i.ID)
}
func (s *Store) SetItemStatus(ctx context.Context, id int64, c domain.Completion) (domain.Item, error) {
	if c.Status < domain.StatusActive || c.Status > domain.StatusArchived {
		return domain.Item{}, fmt.Errorf("%w: invalid status", domain.ErrInvalid)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Item{}, err
	}
	defer tx.Rollback()
	out, err := setItemStatusTx(ctx, tx, id, c)
	if err != nil {
		return out, err
	}
	return out, tx.Commit()
}

func setItemStatusTx(ctx context.Context, tx *sql.Tx, id int64, c domain.Completion) (domain.Item, error) {
	old, err := getItem(ctx, tx, id)
	if err != nil {
		return old, err
	}
	if c.ExpectedVersion > 0 && old.Version != c.ExpectedVersion {
		return old, domain.ErrConflict
	}
	if old.Status == c.Status {
		return old, nil
	}
	now := time.Now().UTC()
	var completedAt, archivedAt any
	if c.Status == domain.StatusCompleted {
		completedAt = formatTime(now)
	}
	if c.Status == domain.StatusArchived {
		archivedAt = formatTime(now)
	}
	_, err = tx.ExecContext(ctx, `UPDATE items SET status=?,completed=?,completed_at=CASE WHEN ?=2 THEN ? WHEN ?=1 THEN NULL ELSE completed_at END,archived_at=CASE WHEN ?=3 THEN ? ELSE NULL END,version=version+1,updated_at=? WHERE id=?`, c.Status, c.Status == domain.StatusCompleted, c.Status, completedAt, c.Status, c.Status, archivedAt, formatTime(now), id)
	if err != nil {
		return old, err
	}
	if c.Status == domain.StatusCompleted && old.Status != domain.StatusCompleted {
		store := strings.TrimSpace(c.ActualStore)
		if store == "" {
			store = old.PreferredStore
		}
		price := c.ActualUnitPrice
		if price.Currency == "" {
			price = old.EstimatedUnitPrice
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO purchases(item_name,store,quantity,bought_at,item_id,list_id,unit,unit_price_minor,currency) VALUES(?,?,?,?,?,?,?,?,?)`, old.Name, store, old.Quantity, formatTime(now), old.ID, old.ListID, old.Unit, price.MinorUnits, price.Currency)
		if err != nil {
			return old, err
		}
	}
	if old.Status == domain.StatusCompleted && c.Status == domain.StatusActive {
		if _, err = tx.ExecContext(ctx, `DELETE FROM purchases WHERE id=(SELECT id FROM purchases WHERE item_id=? ORDER BY bought_at DESC LIMIT 1)`, id); err != nil {
			return old, err
		}
	}
	return getItem(ctx, tx, id)
}
func (s *Store) CompleteItems(ctx context.Context, ids []int64, store string) ([]domain.Item, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	if len(ids) > 500 {
		return nil, fmt.Errorf("%w: at most 500 items", domain.ErrInvalid)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	seen := make(map[int64]struct{}, len(ids))
	out := make([]domain.Item, 0, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		i, err := setItemStatusTx(ctx, tx, id, domain.Completion{Status: domain.StatusCompleted, ActualStore: store})
		if err != nil {
			return out, err
		}
		out = append(out, i)
	}
	return out, tx.Commit()
}
func (s *Store) Summary(ctx context.Context, listID int64) (domain.Summary, error) {
	var out domain.Summary
	err := s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(CASE WHEN status=1 THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN status=2 THEN 1 ELSE 0 END),0) FROM items WHERE (?=0 OR list_id=?) AND status<>3`, listID, listID).Scan(&out.ActiveCount, &out.CompletedCount)
	if err != nil {
		return out, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT currency,CAST(ROUND(SUM(quantity*estimated_unit_price_minor)) AS INTEGER) FROM items WHERE (?=0 OR list_id=?) AND status=1 AND estimated_unit_price_minor>0 GROUP BY currency ORDER BY currency`, listID, listID)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var m domain.Money
		if err = rows.Scan(&m.Currency, &m.MinorUnits); err != nil {
			rows.Close()
			return out, err
		}
		out.EstimatedTotals = append(out.EstimatedTotals, m)
	}
	if err = rows.Close(); err != nil {
		return out, err
	}
	out.Stores, err = s.distinct(ctx, `SELECT DISTINCT preferred_store FROM items WHERE (?=0 OR list_id=?) AND status=1 AND preferred_store<>'' ORDER BY preferred_store`, listID)
	if err != nil {
		return out, err
	}
	out.Categories, err = s.distinct(ctx, `SELECT DISTINCT category FROM items WHERE (?=0 OR list_id=?) AND status=1 AND category<>'' ORDER BY category`, listID)
	return out, err
}
func (s *Store) PurchaseHistory(ctx context.Context) ([]domain.Purchase, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT item_name,store,quantity,unit,unit_price_minor,currency,bought_at FROM purchases ORDER BY bought_at DESC LIMIT 10000`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Purchase
	for rows.Next() {
		var p domain.Purchase
		var at string
		if err = rows.Scan(&p.Name, &p.Store, &p.Quantity, &p.Unit, &p.UnitPriceMinor, &p.Currency, &at); err != nil {
			return nil, err
		}
		if p.BoughtAt, err = parseTime(at); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
func (s *Store) Export(ctx context.Context) (domain.Export, error) {
	var out domain.Export
	var err error
	out.Lists, err = s.ListLists(ctx, true)
	if err != nil {
		return out, err
	}
	filter := domain.ItemFilter{Statuses: []domain.ItemStatus{domain.StatusActive, domain.StatusCompleted, domain.StatusArchived}, Limit: 500}
	for {
		page, total, e := s.ListItems(ctx, filter)
		if e != nil {
			return out, e
		}
		out.Items = append(out.Items, page...)
		if int64(len(out.Items)) >= total {
			break
		}
		filter.Offset += len(page)
	}
	out.Purchases, err = s.PurchaseHistory(ctx)
	out.ExportedAt = time.Now().UTC()
	return out, err
}

const itemSelect = `SELECT id,list_id,name,normalized_name,quantity,unit,preferred_store,category,note,priority,status,estimated_unit_price_minor,currency,barcode,image_url,position,version,due_at,created_at,updated_at,completed_at,archived_at FROM items`

type scanner interface{ Scan(...any) error }
type queryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func scanItem(row scanner) (domain.Item, error) {
	var i domain.Item
	var due, completed, archived sql.NullString
	var created, updated string
	err := row.Scan(&i.ID, &i.ListID, &i.Name, &i.NormalizedName, &i.Quantity, &i.Unit, &i.PreferredStore, &i.Category, &i.Note, &i.Priority, &i.Status, &i.EstimatedUnitPrice.MinorUnits, &i.EstimatedUnitPrice.Currency, &i.Barcode, &i.ImageURL, &i.Position, &i.Version, &due, &created, &updated, &completed, &archived)
	if err != nil {
		return i, err
	}
	i.CreatedAt, err = parseTime(created)
	if err != nil {
		return i, err
	}
	i.UpdatedAt, err = parseTime(updated)
	if err != nil {
		return i, err
	}
	i.DueAt, err = parseNullTime(due)
	if err != nil {
		return i, err
	}
	i.CompletedAt, err = parseNullTime(completed)
	if err != nil {
		return i, err
	}
	i.ArchivedAt, err = parseNullTime(archived)
	return i, err
}
func getItem(ctx context.Context, q queryer, id int64) (domain.Item, error) {
	return scanItem(q.QueryRowContext(ctx, itemSelect+` WHERE id=?`, id))
}
func getItemByKey(ctx context.Context, q queryer, key string) (domain.Item, error) {
	return scanItem(q.QueryRowContext(ctx, itemSelect+` WHERE idempotency_key=?`, key))
}
func findDuplicate(ctx context.Context, q queryer, i domain.Item) (domain.Item, error) {
	return scanItem(q.QueryRowContext(ctx, itemSelect+` WHERE list_id=? AND normalized_name=? AND unit=? COLLATE NOCASE AND preferred_store=? COLLATE NOCASE AND status=1 LIMIT 1`, i.ListID, i.NormalizedName, i.Unit, i.PreferredStore))
}
func scanList(row scanner) (domain.ShoppingList, error) {
	var v domain.ShoppingList
	var created, updated string
	err := row.Scan(&v.ID, &v.Name, &v.Description, &v.Color, &v.Default, &v.Archived, &v.Version, &created, &updated)
	if err != nil {
		return v, err
	}
	v.CreatedAt, err = parseTime(created)
	if err == nil {
		v.UpdatedAt, err = parseTime(updated)
	}
	return v, err
}
func getList(ctx context.Context, q queryer, id int64) (domain.ShoppingList, error) {
	return scanList(q.QueryRowContext(ctx, `SELECT id,name,description,color,is_default,archived,version,created_at,updated_at FROM shopping_lists WHERE id=?`, id))
}
func getListByKey(ctx context.Context, q queryer, key string) (domain.ShoppingList, error) {
	return scanList(q.QueryRowContext(ctx, `SELECT id,name,description,color,is_default,archived,version,created_at,updated_at FROM shopping_lists WHERE idempotency_key=?`, key))
}
func itemWhere(f domain.ItemFilter) (string, []any) {
	var clauses []string
	var args []any
	if f.ListID > 0 {
		clauses = append(clauses, "list_id=?")
		args = append(args, f.ListID)
	}
	if len(f.Statuses) > 0 {
		marks := make([]string, len(f.Statuses))
		for n, v := range f.Statuses {
			marks[n] = "?"
			args = append(args, v)
		}
		clauses = append(clauses, "status IN ("+strings.Join(marks, ",")+")")
	} else {
		clauses = append(clauses, "status<>3")
	}
	if q := normalize(f.Query); q != "" {
		clauses = append(clauses, "(normalized_name LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\')")
		like := "%" + escapeLike(q) + "%"
		args = append(args, like, like)
	}
	if f.Store != "" {
		clauses = append(clauses, "preferred_store=? COLLATE NOCASE")
		args = append(args, strings.TrimSpace(f.Store))
	}
	if f.Category != "" {
		clauses = append(clauses, "category=? COLLATE NOCASE")
		args = append(args, strings.TrimSpace(f.Category))
	}
	if len(clauses) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(clauses, " AND "), args
}
func (s *Store) distinct(ctx context.Context, q string, listID int64) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, q, listID, listID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var v string
		if err = rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func prepareItem(i *domain.Item) error {
	i.Name = strings.TrimSpace(i.Name)
	if err := validateText("item name", i.Name, 1, 200); err != nil {
		return err
	}
	if math.IsNaN(i.Quantity) || math.IsInf(i.Quantity, 0) || i.Quantity <= 0 || i.Quantity > 1e9 {
		return fmt.Errorf("%w: quantity must be finite and greater than zero", domain.ErrInvalid)
	}
	if i.Priority == 0 {
		i.Priority = domain.PriorityNormal
	}
	if i.Priority < domain.PriorityLow || i.Priority > domain.PriorityUrgent {
		return fmt.Errorf("%w: invalid priority", domain.ErrInvalid)
	}
	if i.Status == 0 {
		i.Status = domain.StatusActive
	}
	if i.Status < domain.StatusActive || i.Status > domain.StatusArchived {
		return fmt.Errorf("%w: invalid status", domain.ErrInvalid)
	}
	for label, pair := range map[string]struct {
		v   string
		max int
	}{"unit": {i.Unit, 40}, "store": {i.PreferredStore, 120}, "category": {i.Category, 120}, "note": {i.Note, 2000}, "barcode": {i.Barcode, 128}} {
		if err := validateText(label, pair.v, 0, pair.max); err != nil {
			return err
		}
	}
	if i.EstimatedUnitPrice.MinorUnits < 0 {
		return fmt.Errorf("%w: price cannot be negative", domain.ErrInvalid)
	}
	i.EstimatedUnitPrice.Currency = strings.ToUpper(strings.TrimSpace(i.EstimatedUnitPrice.Currency))
	if i.EstimatedUnitPrice.MinorUnits > 0 && len(i.EstimatedUnitPrice.Currency) != 3 {
		return fmt.Errorf("%w: currency must be a 3-letter code", domain.ErrInvalid)
	}
	if i.ImageURL != "" {
		u, err := url.Parse(i.ImageURL)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
			return fmt.Errorf("%w: invalid image URL", domain.ErrInvalid)
		}
	}
	i.NormalizedName = normalize(i.Name)
	i.Unit = strings.TrimSpace(i.Unit)
	i.PreferredStore = strings.TrimSpace(i.PreferredStore)
	i.Category = strings.TrimSpace(i.Category)
	i.Note = strings.TrimSpace(i.Note)
	now := time.Now().UTC()
	if i.CreatedAt.IsZero() {
		i.CreatedAt = now
	}
	i.UpdatedAt = now
	i.Version = max(i.Version, 1)
	return nil
}
func validateText(label, v string, minRunes, maxRunes int) error {
	if !utf8.ValidString(v) {
		return fmt.Errorf("%w: %s is not valid UTF-8", domain.ErrInvalid, label)
	}
	n := utf8.RuneCountInString(v)
	if n < minRunes || n > maxRunes {
		return fmt.Errorf("%w: %s must be %d-%d characters", domain.ErrInvalid, label, minRunes, maxRunes)
	}
	for _, r := range v {
		if r == 0 {
			return fmt.Errorf("%w: %s contains a null character", domain.ErrInvalid, label)
		}
	}
	return nil
}
func normalize(v string) string {
	return cases.Fold().String(norm.NFKC.String(strings.Join(strings.Fields(v), " ")))
}
func escapeLike(v string) string {
	v = strings.ReplaceAll(v, "\\", "\\\\")
	v = strings.ReplaceAll(v, "%", "\\%")
	return strings.ReplaceAll(v, "_", "\\_")
}
func mapConstraint(err error) error {
	if err == nil {
		return nil
	}
	if strings.Contains(strings.ToLower(err.Error()), "unique constraint") {
		return fmt.Errorf("%w: %v", domain.ErrDuplicate, err)
	}
	return err
}
func formatTime(v time.Time) string         { return v.UTC().Format(time.RFC3339Nano) }
func parseTime(v string) (time.Time, error) { return time.Parse(time.RFC3339Nano, v) }
func parseNullTime(v sql.NullString) (*time.Time, error) {
	if !v.Valid {
		return nil, nil
	}
	t, err := parseTime(v.String)
	return &t, err
}
func nullTime(v *time.Time) any {
	if v == nil {
		return nil
	}
	return formatTime(*v)
}
func nullString(v string) any {
	if v == "" {
		return nil
	}
	return v
}
