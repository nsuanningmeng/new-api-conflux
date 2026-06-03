package model

import (
	"fmt"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupCardShopTestDB(t *testing.T) {
	t.Helper()
	oldDB := DB
	oldSQLite := common.UsingSQLite
	oldMySQL := common.UsingMySQL
	oldPostgres := common.UsingPostgreSQL
	oldSecret := common.CryptoSecret
	oldExplicit := common.CryptoSecretExplicitlyConfigured

	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.CryptoSecret = "card-shop-test-secret"
	common.CryptoSecretExplicitlyConfigured = true
	require.NoError(t, DB.AutoMigrate(&Product{}, &Card{}, &CardOrder{}))

	t.Cleanup(func() {
		DB = oldDB
		common.UsingSQLite = oldSQLite
		common.UsingMySQL = oldMySQL
		common.UsingPostgreSQL = oldPostgres
		common.CryptoSecret = oldSecret
		common.CryptoSecretExplicitlyConfigured = oldExplicit
	})
}

func createCardShopProductWithCards(t *testing.T, cards []string) *Product {
	t.Helper()
	product := &Product{Name: "test product", Price: 10, Enabled: true}
	require.NoError(t, CreateProduct(product))
	count, err := BatchCreateCards(product.ID, cards)
	require.NoError(t, err)
	require.Equal(t, len(cards), count)
	return product
}

func createReservedCardShopOrder(t *testing.T, userID int, product *Product, tradeNo string) *CardOrder {
	t.Helper()
	order := &CardOrder{
		UserID:         userID,
		ProductID:      product.ID,
		TradeNo:        tradeNo,
		Amount:         product.Price,
		Money:          float64(product.Price),
		Status:         CardShopOrderPending,
		ExpectedAmount: product.Price * 100,
		Currency:       "USD",
		FlowOrderNo:    tradeNo + "-flow",
		ProductName:    product.Name,
		CreateTime:     common.GetTimestamp(),
	}
	require.NoError(t, CreateReservedCardOrder(order))
	require.Greater(t, order.CardID, int64(0))
	return order
}

func TestCardShopWebhookAmountMismatchDoesNotDeliver(t *testing.T) {
	setupCardShopTestDB(t)
	product := createCardShopProductWithCards(t, []string{"card-a"})
	order := createReservedCardShopOrder(t, 1, product, "CARDSHOP-1")

	err := CompleteCardOrderPaymentAndDeliver(order.TradeNo, order.ExpectedAmount-1, order.Currency, order.FlowOrderNo)
	require.ErrorIs(t, err, ErrCardShopPaymentMismatch)

	reloaded, err := GetCardOrderByID(order.ID)
	require.NoError(t, err)
	require.Equal(t, CardShopOrderPending, reloaded.Status)
	card, err := GetCardByID(order.CardID)
	require.NoError(t, err)
	require.Equal(t, CardShopCardReserved, card.Status)
}

func TestCardShopDuplicateWebhookIsIdempotent(t *testing.T) {
	setupCardShopTestDB(t)
	product := createCardShopProductWithCards(t, []string{"card-a"})
	order := createReservedCardShopOrder(t, 1, product, "CARDSHOP-1")

	require.NoError(t, CompleteCardOrderPaymentAndDeliver(order.TradeNo, order.ExpectedAmount, order.Currency, order.FlowOrderNo))
	require.NoError(t, CompleteCardOrderPaymentAndDeliver(order.TradeNo, order.ExpectedAmount, order.Currency, order.FlowOrderNo))

	reloaded, err := GetCardOrderByID(order.ID)
	require.NoError(t, err)
	require.Equal(t, CardShopOrderDelivered, reloaded.Status)
	require.Equal(t, order.CardID, reloaded.CardID)
	var sold int64
	require.NoError(t, DB.Model(&Card{}).Where("status = ?", CardShopCardSold).Count(&sold).Error)
	require.Equal(t, int64(1), sold)
}

func TestCardShopConcurrentDeliveryDoesNotAssignSameCardTwice(t *testing.T) {
	setupCardShopTestDB(t)
	product := createCardShopProductWithCards(t, []string{"card-a", "card-b"})
	orderA := createReservedCardShopOrder(t, 1, product, "CARDSHOP-1")
	orderB := createReservedCardShopOrder(t, 2, product, "CARDSHOP-2")

	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for _, order := range []*CardOrder{orderA, orderB} {
		wg.Add(1)
		go func(o *CardOrder) {
			defer wg.Done()
			errs <- CompleteCardOrderPaymentAndDeliver(o.TradeNo, o.ExpectedAmount, o.Currency, o.FlowOrderNo)
		}(order)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}

	reloadedA, err := GetCardOrderByID(orderA.ID)
	require.NoError(t, err)
	reloadedB, err := GetCardOrderByID(orderB.ID)
	require.NoError(t, err)
	require.NotEqual(t, reloadedA.CardID, reloadedB.CardID)
}

func TestCardShopNoStockAfterPaymentFailsGracefully(t *testing.T) {
	setupCardShopTestDB(t)
	product := &Product{Name: "test product", Price: 10, Enabled: true}
	require.NoError(t, CreateProduct(product))
	order := &CardOrder{
		UserID:         1,
		ProductID:      product.ID,
		TradeNo:        "CARDSHOP-1",
		Amount:         product.Price,
		Money:          float64(product.Price),
		Status:         CardShopOrderPaid,
		ExpectedAmount: product.Price * 100,
		Currency:       "USD",
		FlowOrderNo:    "flow-1",
		CreateTime:     common.GetTimestamp(),
	}
	require.NoError(t, CreateCardOrder(order))

	err := DeliverCardOrder(order.TradeNo)
	require.ErrorIs(t, err, ErrCardShopNoStock)
}

func TestCardShopManualDeliverPendingRejectsWithoutForce(t *testing.T) {
	setupCardShopTestDB(t)
	product := createCardShopProductWithCards(t, []string{"card-a"})
	order := createReservedCardShopOrder(t, 1, product, "CARDSHOP-1")

	require.ErrorIs(t, ManualDeliverCardOrder(order.ID, false), ErrCardShopOrderStatus)
	require.NoError(t, ManualDeliverCardOrder(order.ID, true))
}

func TestCardShopEncryptionRoundTrip(t *testing.T) {
	setupCardShopTestDB(t)
	encrypted, err := common.AESEncrypt("secret-card-content")
	require.NoError(t, err)
	decrypted, err := common.AESDecrypt(encrypted)
	require.NoError(t, err)
	require.Equal(t, "secret-card-content", decrypted)
}
