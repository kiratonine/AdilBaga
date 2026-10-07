package voice

import (
	"adilbaga/backend-go/internal/catalog"
	"adilbaga/backend-go/internal/location"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
)

type Service struct {
	Parser     Parser
	Sessions   SessionStore
	Categories catalog.CategoryRepository
	Products   catalog.ProductRepository
	Locations  location.Repository
}

func (s *Service) input(ctx context.Context, text string, current *string) (Input, error) {
	categories, err := s.Categories.ListCategories(ctx)
	if err != nil {
		return Input{}, errors.New("voice category dependency failed")
	}
	in := Input{Text: text, Categories: categories, CurrentCategory: current}
	for _, c := range categories {
		schema, err := s.Categories.GetFilterSchema(ctx, c.Slug)
		if err != nil {
			return Input{}, errors.New("voice schema dependency failed")
		}
		in.Schemas = append(in.Schemas, schema)
	}
	return in, nil
}
func (s *Service) Start(ctx context.Context, r StartRequest) (Response, error) {
	in, err := s.input(ctx, r.Text, nil)
	if err != nil {
		return Response{}, err
	}
	p, err := s.Parser.Parse(ctx, in)
	if err != nil {
		return Response{}, errors.New("voice parsing failed")
	}
	return s.advance(ctx, Session{Parsed: p, Latitude: r.Latitude, Longitude: r.Longitude}, "")
}
func (s *Service) Continue(ctx context.Context, r ContinueRequest) (Response, error) {
	if s.Sessions == nil {
		return Response{}, ErrSessionUnavailable
	}
	previous, found, err := s.Sessions.Get(ctx, r.SessionID)
	if err != nil {
		return Response{}, ErrSessionUnavailable
	}
	if !found {
		return Response{}, ErrNotFound
	}
	in, err := s.input(ctx, r.Text, previous.Category)
	if err != nil {
		return Response{}, err
	}
	in.ExpectedFields = QuestionFields(Missing(previous))
	p, err := s.Parser.Parse(ctx, in)
	if err != nil {
		return Response{}, errors.New("voice parsing failed")
	}
	return s.advance(ctx, Merge(previous, p, in.Schemas), r.SessionID)
}
func (s *Service) advance(ctx context.Context, state Session, id string) (Response, error) {
	missing := Missing(state)
	if len(missing) > 0 {
		if s.Sessions == nil {
			return Response{}, ErrSessionUnavailable
		}
		if id == "" {
			var random [16]byte
			if _, err := rand.Read(random[:]); err != nil {
				return Response{}, errors.New("voice session creation failed")
			}
			id = hex.EncodeToString(random[:])
		}
		if s.Sessions.Set(ctx, id, state, SessionTTL) != nil {
			return Response{}, ErrSessionUnavailable
		}
		return Response{Status: "needs_clarification", SessionID: id, Question: Question(missing), MissingFields: missing}, nil
	}
	response, err := s.result(ctx, state)
	if err != nil {
		return Response{}, err
	}
	if id != "" && (s.Sessions == nil || s.Sessions.Delete(ctx, id) != nil) {
		return Response{}, ErrSessionUnavailable
	}
	return response, nil
}
func (s *Service) result(ctx context.Context, state Session) (Response, error) {
	limit := 3
	mode := "list"
	if *state.Intent == "cheapest" {
		limit = 1
		mode = "single"
	}
	filters := catalog.DynamicFilter{}
	for k, v := range state.Filters {
		if strings.TrimSpace(string(v)) != "null" {
			filters[k] = []json.RawMessage{v}
		}
	}
	products, err := s.Products.ListProducts(ctx, catalog.ProductQuery{Category: *state.Category, Sort: catalog.PriceAsc, Limit: limit, Filters: filters})
	if err != nil {
		return Response{}, errors.New("voice product dependency failed")
	}
	if len(products) > limit {
		return Response{}, errors.New("voice product invariant failed")
	}
	items := []Item{}
	var locations []location.Location
	if len(products) > 0 {
		locations, err = s.Locations.ListLocations(ctx)
		if err != nil {
			return Response{}, errors.New("voice location dependency failed")
		}
	}
	for _, p := range products {
		if len(p.Offers) == 0 {
			return Response{}, errors.New("voice offer invariant failed")
		}
		o := p.Offers[0]
		item := Item{Name: p.Name, Price: o.Price, Store: o.StoreName, ImageURL: p.ImageURL}
		nearest, distance := location.Nearest(state.Latitude, state.Longitude, o.StoreCode, locations)
		if nearest != nil {
			item.Address = &nearest.Address
			rounded := int(math.Floor(distance + 0.5))
			item.DistanceMeters = &rounded
		}
		items = append(items, item)
	}
	return Response{Status: "result", Mode: mode, Items: items, Speech: Speech(items, mode)}, nil
}
func metersWord(distance int) string {
	lastTwo := distance % 100
	if lastTwo >= 11 && lastTwo <= 14 {
		return "метров"
	}
	last := distance % 10
	if last == 1 {
		return "метр"
	}
	if last >= 2 && last <= 4 {
		return "метра"
	}
	return "метров"
}
func Speech(items []Item, mode string) string {
	if len(items) == 0 {
		return "Подходящих товаров не найдено."
	}
	if mode == "single" {
		i := items[0]
		text := fmt.Sprintf("Самое выгодное предложение: %s за %d тенге в %s.", i.Name, i.Price, i.Store)
		if i.Address != nil && *i.Address != "" && i.DistanceMeters != nil {
			text += fmt.Sprintf(" Ближайшая точка — %s, примерно %d %s.", *i.Address, *i.DistanceMeters, metersWord(*i.DistanceMeters))
		}
		return text
	}
	introduction := "Нашёл один вариант."
	if len(items) > 1 {
		introduction = fmt.Sprintf("Нашёл %d варианта.", len(items))
	}
	parts := []string{introduction}
	for index, i := range items {
		parts = append(parts, fmt.Sprintf("%s — %s за %d тенге в %s.", []string{"Первый", "Второй", "Третий"}[index], i.Name, i.Price, i.Store))
	}
	return strings.Join(parts, " ")
}
