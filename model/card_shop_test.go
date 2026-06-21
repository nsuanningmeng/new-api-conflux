package model

import (
	"fmt"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
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
	added, _, err := BatchCreateCards(product.ID, cards)
	require.NoError(t, err)
	require.Equal(t, len(cards), added)
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

func TestCardShopImportRequiresExplicitCryptoSecret(t *testing.T) {
	setupCardShopTestDB(t)
	// 模拟未显式配置 CRYPTO_SECRET 的部署：首次导入卡密必须被拒绝，
	// 避免用启动随机密钥加密导致重启后不可解密（B1 缺口回归测试）。
	common.CryptoSecretExplicitlyConfigured = false
	product := &Product{Name: "test product", Price: 10, Enabled: true}
	require.NoError(t, CreateProduct(product))

	_, _, err := BatchCreateCards(product.ID, []string{"card-a"})
	require.ErrorIs(t, err, ErrCardShopCryptoSecretRequired)

	var count int64
	require.NoError(t, DB.Model(&Card{}).Count(&count).Error)
	require.Equal(t, int64(0), count)
}

func TestCardShopImportDeduplicatesCards(t *testing.T) {
	setupCardShopTestDB(t)
	product := &Product{Name: "test product", Price: 10, Enabled: true}
	require.NoError(t, CreateProduct(product))

	// 首次导入两张不同卡密。
	added, skipped, err := BatchCreateCards(product.ID, []string{"card-a", "card-b"})
	require.NoError(t, err)
	require.Equal(t, 2, added)
	require.Equal(t, 0, skipped)

	// 二次导入：card-a 与已存在重复；card-c 为新卡但在批次内重复出现两次。
	// 期望：仅新增 card-c 一张，跳过 2 张（已存在的 card-a + 批次内重复的 card-c）。
	added, skipped, err = BatchCreateCards(product.ID, []string{"card-a", "card-c", "card-c"})
	require.NoError(t, err)
	require.Equal(t, 1, added)
	require.Equal(t, 2, skipped)

	// 库存应为 3（a、b、c），而非朴素追加后的 5。
	var avail int64
	require.NoError(t, DB.Model(&Card{}).Where("product_id = ? AND status = ?", product.ID, CardShopCardAvailable).Count(&avail).Error)
	require.Equal(t, int64(3), avail)

	reloaded, err := GetProductByID(product.ID)
	require.NoError(t, err)
	require.Equal(t, 3, reloaded.Stock)
}

// TestCardShopPreviewImportCardsMatchesActualImport 验证导入试算的核心不变式：
// PreviewImportCards 返回的 NewCount 必须严格等于随后 BatchCreateCards 的实际新增数，
// 且 total/batch_dup/existing_dup 三个分量与去重口径一致（前端据此把「将导入张数」精确到入库数）。
func TestCardShopPreviewImportCardsMatchesActualImport(t *testing.T) {
	setupCardShopTestDB(t)
	product := &Product{Name: "test product", Price: 10, Enabled: true}
	require.NoError(t, CreateProduct(product))

	// 先导入一张 card-a，建立既有库存。
	added, _, err := BatchCreateCards(product.ID, []string{"card-a"})
	require.NoError(t, err)
	require.Equal(t, 1, added)

	// 试算一批：" card-a "（去空白后与库存重复）、card-b（新、批内重复两次）、card-c（新）。
	// 期望：Total=4，BatchDup=1（多出的 card-b），ExistingDup=1（card-a），NewCount=2（card-b、card-c）。
	batch := []string{" card-a ", "card-b", "card-b", "card-c"}
	preview, err := PreviewImportCards(product.ID, batch)
	require.NoError(t, err)
	require.Equal(t, 4, preview.Total)
	require.Equal(t, 1, preview.BatchDup)
	require.Equal(t, 1, preview.ExistingDup)
	require.Equal(t, 2, preview.NewCount)

	// 试算不写入任何数据：库存仍为 1。
	var availBefore int64
	require.NoError(t, DB.Model(&Card{}).Where("product_id = ? AND status = ?", product.ID, CardShopCardAvailable).Count(&availBefore).Error)
	require.Equal(t, int64(1), availBefore)

	// 关键不变式：试算 NewCount == 真正导入的新增数（口径一致）。
	actualAdded, actualSkipped, err := BatchCreateCards(product.ID, batch)
	require.NoError(t, err)
	require.Equal(t, preview.NewCount, actualAdded)
	require.Equal(t, preview.BatchDup+preview.ExistingDup, actualSkipped)
}

// TestCardShopPreviewImportRequiresExplicitCryptoSecret 验证试算与导入同口径：
// 未显式配置 CRYPTO_SECRET 时试算同样被拒绝（前端据此回退本地计数，不误报精确值）。
func TestCardShopPreviewImportRequiresExplicitCryptoSecret(t *testing.T) {
	setupCardShopTestDB(t)
	common.CryptoSecretExplicitlyConfigured = false
	product := &Product{Name: "test product", Price: 10, Enabled: true}
	require.NoError(t, CreateProduct(product))

	_, err := PreviewImportCards(product.ID, []string{"card-a"})
	require.ErrorIs(t, err, ErrCardShopCryptoSecretRequired)
}

// TestCardShopPreviewImportEmptyReturnsZero 验证空输入（管理员清空输入框）返回全 0 而非报错。
func TestCardShopPreviewImportEmptyReturnsZero(t *testing.T) {
	setupCardShopTestDB(t)
	product := &Product{Name: "test product", Price: 10, Enabled: true}
	require.NoError(t, CreateProduct(product))

	preview, err := PreviewImportCards(product.ID, []string{"  ", "", "\t"})
	require.NoError(t, err)
	require.Equal(t, &CardImportPreview{}, preview)
}

// TestCardShopPreviewImportMissingProductReturnsError 验证试算对不存在/已删除商品返回
// ErrCardShopProductNotFound（与导入路径在锁内的商品校验对齐），使不变式在商品缺失时也成立。
func TestCardShopPreviewImportMissingProductReturnsError(t *testing.T) {
	setupCardShopTestDB(t)
	_, err := PreviewImportCards(99999, []string{"card-a"})
	require.ErrorIs(t, err, ErrCardShopProductNotFound)
}

func TestCardShopLegacyTableRenameMigratesData(t *testing.T) {
	oldDB := DB
	oldSQLite := common.UsingSQLite
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	common.UsingSQLite = true
	t.Cleanup(func() {
		DB = oldDB
		common.UsingSQLite = oldSQLite
	})

	// 模拟旧版本遗留的通用表名 + 数据
	require.NoError(t, DB.Exec("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT)").Error)
	require.NoError(t, DB.Exec("INSERT INTO products (id, name) VALUES (1, 'legacy-product')").Error)

	// 重命名迁移：旧表改名为新前缀表，数据保留
	require.NoError(t, renameCardShopLegacyTables())
	require.True(t, DB.Migrator().HasTable("card_shop_products"))
	require.False(t, DB.Migrator().HasTable("products"))

	var name string
	require.NoError(t, DB.Raw("SELECT name FROM card_shop_products WHERE id = 1").Scan(&name).Error)
	require.Equal(t, "legacy-product", name)

	// 幂等：再次执行不应报错或改动数据
	require.NoError(t, renameCardShopLegacyTables())
	require.True(t, DB.Migrator().HasTable("card_shop_products"))
}

// TestCardShopDeleteProductHidesFromListsButKeepsDeliveredCard 回归测试：
// 删除商品后必须同时从「管理端列表」与「前台 storefront」消失（修复「删除成功但商品仍在」），
// 同时已交付订单的已售卡密必须仍可解密展示（软删除不级联删除 card_shop_cards）。
func TestCardShopDeleteProductHidesFromListsButKeepsDeliveredCard(t *testing.T) {
	setupCardShopTestDB(t)
	product := createCardShopProductWithCards(t, []string{"card-a"})
	order := createReservedCardShopOrder(t, 1, product, "CARDSHOP-1")
	require.NoError(t, CompleteCardOrderPaymentAndDeliver(order.TradeNo, order.ExpectedAmount, order.Currency, order.FlowOrderNo))

	require.NoError(t, DeleteProduct(product.ID))

	// 管理端列表不再返回该商品（此前 GetAllProducts 无 enabled/deleted 过滤 -> bug 根因）
	all, err := GetAllProducts()
	require.NoError(t, err)
	for _, p := range all {
		require.NotEqual(t, product.ID, p.ID, "deleted product must not appear in admin list")
	}

	// 前台 storefront 不再返回该商品
	enabled, err := GetAllEnabledProducts()
	require.NoError(t, err)
	for _, p := range enabled {
		require.NotEqual(t, product.ID, p.ID, "deleted product must not appear in storefront")
	}

	// 按 ID 查询视为不存在（GORM 软删除默认作用域自动排除）
	_, err = GetProductByID(product.ID)
	require.ErrorIs(t, err, ErrCardShopProductNotFound)

	// 已交付订单的已售卡密仍可解密展示（未被级联删除）
	reloadedOrder, err := GetCardOrderByID(order.ID)
	require.NoError(t, err)
	require.Equal(t, CardShopOrderDelivered, reloadedOrder.Status)
	card, err := GetCardByID(reloadedOrder.CardID)
	require.NoError(t, err)
	require.Equal(t, "card-a", card.CardContent)
	require.Equal(t, CardShopCardSold, card.Status)

	// 商品行仍物理存在、仅 deleted_at 被置位（可逆）
	var cnt int64
	require.NoError(t, DB.Unscoped().Model(&Product{}).Where("id = ?", product.ID).Count(&cnt).Error)
	require.Equal(t, int64(1), cnt)

	// 重复删除：软删除行不再匹配默认作用域 -> 视为未找到
	require.ErrorIs(t, DeleteProduct(product.ID), ErrCardShopProductNotFound)
}

// expireAndReleaseCardShopOrder 把订单过期时间改到过去并触发释放，模拟本地 TTL 到期：
// 订单被取消、其预留卡释放回 available。
func expireAndReleaseCardShopOrder(t *testing.T, order *CardOrder) {
	t.Helper()
	require.NoError(t, DB.Model(&CardOrder{}).Where("id = ?", order.ID).Update("expires_at", common.GetTimestamp()-1).Error)
	require.NoError(t, ReleaseExpiredCardShopOrders())
	reloaded, err := GetCardOrderByID(order.ID)
	require.NoError(t, err)
	require.Equal(t, CardShopOrderCancelled, reloaded.Status)
}

// TestCardShopLatePaymentOnCancelledOrderRecoversWhenStockAvailable 回归测试 #3：
// 订单本地 TTL 到期被取消后，若真实支付成功回调才到达，且仍有可用卡，应自动重领卡发货，
// 而非返回 ErrCardShopOrderStatus（那会让网关 500 无限重试且用户已扣款拿不到卡）。
func TestCardShopLatePaymentOnCancelledOrderRecoversWhenStockAvailable(t *testing.T) {
	setupCardShopTestDB(t)
	product := createCardShopProductWithCards(t, []string{"card-a", "card-b"})
	order := createReservedCardShopOrder(t, 1, product, "CARDSHOP-1")

	expireAndReleaseCardShopOrder(t, order)

	require.NoError(t, CompleteCardOrderPaymentAndDeliver(order.TradeNo, order.ExpectedAmount, order.Currency, order.FlowOrderNo))

	delivered, err := GetCardOrderByID(order.ID)
	require.NoError(t, err)
	require.Equal(t, CardShopOrderDelivered, delivered.Status)
	require.Greater(t, delivered.CardID, int64(0))
	card, err := GetCardByID(delivered.CardID)
	require.NoError(t, err)
	require.Equal(t, CardShopCardSold, card.Status)
}

// TestCardShopLatePaymentOnCancelledOrderMarksPaidWhenNoStock 回归测试 #3 兜底：
// 迟付命中已取消订单且已无可用卡可补发时，应标记 paid（待人工补发/退款）并返回 nil，
// 不能报错（避免网关 500 重试循环）。
func TestCardShopLatePaymentOnCancelledOrderMarksPaidWhenNoStock(t *testing.T) {
	setupCardShopTestDB(t)
	product := createCardShopProductWithCards(t, []string{"card-a"})
	order := createReservedCardShopOrder(t, 1, product, "CARDSHOP-1")

	expireAndReleaseCardShopOrder(t, order)

	// 删除唯一可用卡，制造「无库存」。
	var card Card
	require.NoError(t, DB.Where("product_id = ?", product.ID).First(&card).Error)
	require.NoError(t, DeleteCard(card.ID))

	require.NoError(t, CompleteCardOrderPaymentAndDeliver(order.TradeNo, order.ExpectedAmount, order.Currency, order.FlowOrderNo))

	reloaded, err := GetCardOrderByID(order.ID)
	require.NoError(t, err)
	require.Equal(t, CardShopOrderPaid, reloaded.Status)
}

// TestCardShopLatePaymentOnCancelledOrderPropagatesRealDBError 回归测试 #3-Critical：
// 迟付补偿领卡时遇到真实 DB 错误（非"无库存"）必须上抛以回滚事务并让 webhook 重试，
// 绝不能被当成无库存吞掉、把订单静默标记 paid（否则用户已扣款却拿不到卡且不再重试）。
func TestCardShopLatePaymentOnCancelledOrderPropagatesRealDBError(t *testing.T) {
	setupCardShopTestDB(t)
	product := createCardShopProductWithCards(t, []string{"card-a"})
	order := createReservedCardShopOrder(t, 1, product, "CARDSHOP-1")
	expireAndReleaseCardShopOrder(t, order)

	// 注入真实 DB 错误：删掉卡表，使领卡查询失败（区别于 gorm.ErrRecordNotFound 的"无库存"）。
	require.NoError(t, DB.Migrator().DropTable(&Card{}))

	err := CompleteCardOrderPaymentAndDeliver(order.TradeNo, order.ExpectedAmount, order.Currency, order.FlowOrderNo)
	require.Error(t, err, "真实 DB 错误必须上抛，不能被当成无库存吞掉")

	// 订单必须保持 cancelled（事务回滚），不能被静默标记 paid。
	reloaded, rerr := GetCardOrderByID(order.ID)
	require.NoError(t, rerr)
	require.Equal(t, CardShopOrderCancelled, reloaded.Status)
}
