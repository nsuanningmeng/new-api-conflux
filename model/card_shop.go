package model

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	CardShopTradeNoPrefix = "CARDSHOP-"

	CardShopCardAvailable = "available"
	CardShopCardSold      = "sold"
	CardShopCardReserved  = "reserved"

	CardShopOrderPending   = "pending"
	CardShopOrderPaid      = "paid"
	CardShopOrderDelivered = "delivered"
	CardShopOrderCancelled = "cancelled"
)

var (
	ErrCardShopProductNotFound = errors.New("商品不存在")
	ErrCardShopCardNotFound    = errors.New("卡密不存在")
	ErrCardShopOrderNotFound   = errors.New("订单不存在")
	ErrCardShopPaymentMismatch = errors.New("支付信息与订单不匹配")
	ErrCardShopNoStock         = errors.New("商品库存不足")
	ErrCardShopOrderStatus     = errors.New("订单状态不允许发卡")
	// ErrCardShopCryptoSecretRequired 在未显式配置 CRYPTO_SECRET 时拒绝写入卡密，
	// 避免使用启动随机密钥加密导致重启后卡密永久不可解密。
	ErrCardShopCryptoSecretRequired = errors.New("未配置 CRYPTO_SECRET 环境变量，禁止导入卡密：请先设置稳定的 CRYPTO_SECRET 并重启，否则重启后已导入卡密将无法解密")
)

const cardShopOrderTTLSeconds int64 = 30 * 60

var cardShopProductLocks sync.Map

type Product struct {
	ID          int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	Name        string `json:"name" gorm:"type:varchar(255);not null"`
	Description string `json:"description" gorm:"type:text"`
	Price       int64  `json:"price" gorm:"not null"`
	ImageURL    string `json:"image_url" gorm:"type:varchar(500);default:''"`
	Enabled     bool   `json:"enabled" gorm:"default:true"`
	Stock       int    `json:"stock" gorm:"default:0"`
	SortOrder   int    `json:"sort_order" gorm:"default:0"`
	CreatedAt   int64  `json:"created_at" gorm:"autoCreateTime:milli"`
	UpdatedAt   int64  `json:"updated_at" gorm:"autoUpdateTime:milli"`
}

type Card struct {
	ID          int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	ProductID   int64  `json:"product_id" gorm:"index;not null"`
	CardContent string `json:"card_content" gorm:"type:text;not null"`
	CardDisplay string `json:"card_display" gorm:"type:varchar(255);default:''"`
	Status      string `json:"status" gorm:"type:varchar(20);default:'available'"`
	OrderID     int64  `json:"order_id" gorm:"default:0"`
	CreatedAt   int64  `json:"created_at" gorm:"autoCreateTime:milli"`
}

type CardOrder struct {
	ID        int64   `json:"id" gorm:"primaryKey;autoIncrement"`
	UserID    int     `json:"user_id" gorm:"index;not null"`
	ProductID int64   `json:"product_id" gorm:"not null"`
	TradeNo   string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	Amount    int64   `json:"amount"`
	Money     float64 `json:"money"`
	// Two composite indexes lead with the column each query filters first:
	//   idx_cardorder_created_status (create_time, status) — analytics range scans
	//   idx_cardorder_status_expires (status, expires_at)  — expiry sweep seeks
	//     pending orders directly (few/transient) then ranges on expires_at,
	//     instead of scanning every historical order by expires_at.
	Status         string `json:"status" gorm:"type:varchar(20);default:'pending';index:idx_cardorder_created_status,priority:2;index:idx_cardorder_status_expires,priority:1"`
	CardID         int64  `json:"card_id" gorm:"default:0"`
	ExpectedAmount int64  `json:"expected_amount" gorm:"default:0"`
	Currency       string `json:"currency" gorm:"type:varchar(16);default:''"`
	FlowOrderNo    string `json:"flow_order_no" gorm:"type:varchar(255);default:''"`
	ExpiresAt      int64  `json:"expires_at" gorm:"index:idx_cardorder_status_expires,priority:2;default:0"`
	ProductName    string `json:"product_name" gorm:"type:varchar(255);default:''"`
	CreateTime     int64  `json:"create_time" gorm:"index:idx_cardorder_created_status,priority:1"`
	CompleteTime   int64  `json:"complete_time"`
}

// 卡商城三张表使用显式带前缀的表名，避免与上游/运营自定义表潜在冲突。
func (Product) TableName() string   { return "card_shop_products" }
func (Card) TableName() string      { return "card_shop_cards" }
func (CardOrder) TableName() string { return "card_shop_orders" }

// renameCardShopLegacyTables 将早期版本使用的通用表名（products/cards/card_orders）
// 重命名为带 card_shop_ 前缀的新表名。幂等且对全新安装安全：仅当旧表存在且新表不存在时
// 才重命名；使用 GORM Migrator().RenameTable 抽象，兼容 SQLite / MySQL / PostgreSQL。
// 必须在 AutoMigrate 之前调用，以保留存量数据。
func renameCardShopLegacyTables() error {
	legacyTables := []struct {
		oldName string
		newName string
	}{
		{"products", "card_shop_products"},
		{"cards", "card_shop_cards"},
		{"card_orders", "card_shop_orders"},
	}
	migrator := DB.Migrator()
	for _, tbl := range legacyTables {
		if migrator.HasTable(tbl.newName) {
			continue // 新表已存在（全新安装或已迁移），跳过
		}
		if !migrator.HasTable(tbl.oldName) {
			continue // 旧表不存在（全新安装），跳过
		}
		if err := migrator.RenameTable(tbl.oldName, tbl.newName); err != nil {
			return fmt.Errorf("rename card shop table %s -> %s: %w", tbl.oldName, tbl.newName, err)
		}
		common.SysLog(fmt.Sprintf("card shop: renamed legacy table %s to %s", tbl.oldName, tbl.newName))
	}
	return nil
}

func cardShopForUpdate(tx *gorm.DB) *gorm.DB {
	if common.UsingSQLite {
		return tx
	}
	return tx.Clauses(clause.Locking{Strength: "UPDATE"})
}

func withCardShopProductLock(productID int64, fn func() error) error {
	if !common.UsingSQLite || productID <= 0 {
		return fn()
	}
	lock, _ := cardShopProductLocks.LoadOrStore(productID, &sync.Mutex{})
	mu := lock.(*sync.Mutex)
	mu.Lock()
	defer mu.Unlock()
	return fn()
}

func getCardOrderProductIDByTradeNo(tradeNo string) (int64, error) {
	var order CardOrder
	if err := DB.Select("product_id").Where("trade_no = ?", tradeNo).First(&order).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, ErrCardShopOrderNotFound
		}
		return 0, err
	}
	return order.ProductID, nil
}

func getCardOrderProductIDByID(orderID int64) (int64, error) {
	var order CardOrder
	if err := DB.Select("product_id").Where("id = ?", orderID).First(&order).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, ErrCardShopOrderNotFound
		}
		return 0, err
	}
	return order.ProductID, nil
}

func syncProductStockTx(tx *gorm.DB, productID int64) error {
	var available int64
	if err := tx.Model(&Card{}).Where("product_id = ? AND status = ?", productID, CardShopCardAvailable).Count(&available).Error; err != nil {
		return err
	}
	return tx.Model(&Product{}).Where("id = ?", productID).Update("stock", int(available)).Error
}

func CreateProduct(product *Product) error {
	if product == nil {
		return errors.New("商品不能为空")
	}
	return DB.Create(product).Error
}

func UpdateProduct(product *Product) error {
	if product == nil || product.ID <= 0 {
		return errors.New("商品ID不能为空")
	}
	return DB.Save(product).Error
}

func DeleteProduct(id int64) error {
	if id <= 0 {
		return errors.New("商品ID不能为空")
	}
	result := DB.Model(&Product{}).Where("id = ?", id).Update("enabled", false)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrCardShopProductNotFound
	}
	return nil
}

func GetProductByID(id int64) (*Product, error) {
	if id <= 0 {
		return nil, ErrCardShopProductNotFound
	}
	var product Product
	if err := DB.Where("id = ?", id).First(&product).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCardShopProductNotFound
		}
		return nil, err
	}
	return &product, nil
}

func GetAllEnabledProducts() ([]*Product, error) {
	maybeReleaseExpiredCardShopOrders()
	var products []*Product
	// 仅按 enabled 过滤：库存为 0 的商品也在前台展示为「售罄」（ProductCard 已禁用购买），
	// 这样管理员新建商品后即可在前台看到，无需先导入卡密。售罄拦截在下单接口完成。
	err := DB.Where("enabled = ?", true).Order("sort_order desc, id desc").Find(&products).Error
	return products, err
}

var lastCardShopExpiryRelease atomic.Int64

const cardShopExpiryReleaseThrottleSeconds int64 = 60

// maybeReleaseExpiredCardShopOrders runs the expiry sweep at most once per
// throttle window. The public product list calls this on every request; a
// burst of shoppers would otherwise each open a locking transaction. CAS
// ensures only one goroutine runs the sweep per window. Stock from an
// abandoned order is freed within the window (well under the 30-min TTL).
func maybeReleaseExpiredCardShopOrders() {
	now := common.GetTimestamp()
	last := lastCardShopExpiryRelease.Load()
	if now-last < cardShopExpiryReleaseThrottleSeconds {
		return
	}
	if !lastCardShopExpiryRelease.CompareAndSwap(last, now) {
		return
	}
	_ = ReleaseExpiredCardShopOrders()
}

func GetAllProducts() ([]*Product, error) {
	var products []*Product
	err := DB.Order("sort_order desc, id desc").Find(&products).Error
	return products, err
}

func BatchCreateCards(productID int64, cards []string) (int, error) {
	// B1: 写入卡密前强制要求显式配置 CRYPTO_SECRET，堵住「首次空卡表导入」绕过启动检查、
	// 用启动随机密钥加密导致重启后不可解密的数据丢失缺口。
	if !common.CryptoSecretExplicitlyConfigured {
		return 0, ErrCardShopCryptoSecretRequired
	}
	if productID <= 0 {
		return 0, errors.New("商品ID不能为空")
	}
	if len(cards) == 0 {
		return 0, errors.New("卡密不能为空")
	}

	records := make([]Card, 0, len(cards))
	for _, rawCard := range cards {
		cardContent := strings.TrimSpace(rawCard)
		if cardContent == "" {
			continue
		}
		encrypted, err := common.AESEncrypt(cardContent)
		if err != nil {
			return 0, err
		}
		records = append(records, Card{
			ProductID:   productID,
			CardContent: encrypted,
			CardDisplay: MaskCardContent(cardContent),
			Status:      CardShopCardAvailable,
			OrderID:     0,
		})
	}
	if len(records) == 0 {
		return 0, errors.New("有效卡密不能为空")
	}

	return len(records), DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.CreateInBatches(records, 500).Error; err != nil {
			return err
		}
		return syncProductStockTx(tx, productID)
	})
}

func claimAvailableCardForOrderTx(tx *gorm.DB, productID int64, orderID int64) (*Card, error) {
	if productID <= 0 {
		return nil, ErrCardShopCardNotFound
	}
	for attempt := 0; attempt < 3; attempt++ {
		var card Card
		err := cardShopForUpdate(tx).Where("product_id = ? AND status = ?", productID, CardShopCardAvailable).Order("id asc").First(&card).Error
		if err == nil {
			result := tx.Model(&Card{}).Where("id = ? AND status = ?", card.ID, CardShopCardAvailable).Updates(map[string]interface{}{"status": CardShopCardReserved, "order_id": orderID})
			if result.Error != nil {
				return nil, result.Error
			}
			if result.RowsAffected == 1 {
				card.Status = CardShopCardReserved
				card.OrderID = orderID
				return &card, nil
			}
			continue
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCardShopCardNotFound
		}
		return nil, err
	}
	return nil, ErrCardShopNoStock
}

func GetCardByID(id int64) (*Card, error) {
	if id <= 0 {
		return nil, ErrCardShopCardNotFound
	}
	var card Card
	if err := DB.Where("id = ?", id).First(&card).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCardShopCardNotFound
		}
		return nil, err
	}
	decrypted, err := common.AESDecrypt(card.CardContent)
	if err != nil {
		return nil, err
	}
	card.CardContent = decrypted
	return &card, nil
}

// ListCardsByProduct 返回某商品下的卡密列表（分页），用于管理端「管理卡密」。
// 出于安全考虑，列表绝不返回加密后的 CardContent，仅返回掩码展示 CardDisplay 与状态。
func ListCardsByProduct(productID int64, pageInfo *common.PageInfo) (cards []*Card, total int64, err error) {
	if productID <= 0 {
		return nil, 0, ErrCardShopProductNotFound
	}
	tx := DB.Model(&Card{}).Where("product_id = ?", productID)
	if err = tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err = tx.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&cards).Error; err != nil {
		return nil, 0, err
	}
	for _, c := range cards {
		c.CardContent = "" // 永不向前端泄露加密内容
	}
	return cards, total, nil
}

// DeleteCard 删除一张卡密。仅允许删除 available 状态的卡（未被订单锁定、未售出），
// 避免破坏 pending 订单的 reserved 卡或已交付的 sold 卡。删除后重算商品库存。
func DeleteCard(cardID int64) error {
	if cardID <= 0 {
		return ErrCardShopCardNotFound
	}
	var card Card
	if err := DB.Where("id = ?", cardID).First(&card).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrCardShopCardNotFound
		}
		return err
	}
	if card.Status != CardShopCardAvailable {
		return errors.New("仅可删除未售出且未锁定的卡密")
	}
	return withCardShopProductLock(card.ProductID, func() error {
		return DB.Transaction(func(tx *gorm.DB) error {
			// 先锁 product 行，再操作 card，与 reserve/deliver/release 的加锁顺序保持一致
			// （它们都是「先锁 product 再锁 card」）。在 MySQL/PostgreSQL 上 withCardShopProductLock
			// 为 no-op，若此处「先删卡(锁 card) → syncProductStockTx 更新库存(锁 product)」，会与下单
			// 事务「锁 product → 锁 card」形成 AB-BA 死锁；先锁 product 既消除死锁，也让库存重算在
			// product 锁下串行化，避免与并发下单的库存写丢失更新。
			lockProduct := &Product{}
			if err := cardShopForUpdate(tx).Where("id = ?", card.ProductID).First(lockProduct).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrCardShopProductNotFound
				}
				return err
			}
			// 事务内再次以 status 作为条件，防止与下单 reserve 产生竞态：
			// 若卡已在此期间被锁定/售出，RowsAffected==0 则中止删除。
			result := tx.Where("id = ? AND status = ?", cardID, CardShopCardAvailable).Delete(&Card{})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				return errors.New("卡密不存在或已被锁定/售出")
			}
			return syncProductStockTx(tx, card.ProductID)
		})
	})
}

func MaskCardContent(content string) string {
	runes := []rune(strings.TrimSpace(content))
	if len(runes) == 0 {
		return ""
	}
	if len(runes) <= 7 {
		return strings.Repeat("*", len(runes))
	}
	return string(runes[:3]) + "***" + string(runes[len(runes)-4:])
}

func CreateCardOrder(order *CardOrder) error {
	if order == nil {
		return errors.New("订单不能为空")
	}
	if order.CreateTime == 0 {
		order.CreateTime = common.GetTimestamp()
	}
	if order.Status == "" {
		order.Status = CardShopOrderPending
	}
	return DB.Create(order).Error
}

func CreateReservedCardOrder(order *CardOrder) error {
	if order == nil {
		return errors.New("订单不能为空")
	}
	if order.ProductID <= 0 {
		return ErrCardShopProductNotFound
	}
	now := common.GetTimestamp()
	if order.CreateTime == 0 {
		order.CreateTime = now
	}
	if order.ExpiresAt == 0 {
		order.ExpiresAt = now + cardShopOrderTTLSeconds
	}
	if order.Status == "" {
		order.Status = CardShopOrderPending
	}
	return withCardShopProductLock(order.ProductID, func() error {
		return DB.Transaction(func(tx *gorm.DB) error {
			if err := releaseExpiredCardOrdersTx(tx, order.ProductID, now); err != nil {
				return err
			}
			product := &Product{}
			if err := cardShopForUpdate(tx).Where("id = ? AND enabled = ?", order.ProductID, true).First(product).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrCardShopProductNotFound
				}
				return err
			}
			if err := syncProductStockTx(tx, order.ProductID); err != nil {
				return err
			}
			if product.Stock <= 0 {
				var available int64
				if err := tx.Model(&Card{}).Where("product_id = ? AND status = ?", order.ProductID, CardShopCardAvailable).Count(&available).Error; err != nil {
					return err
				}
				if available <= 0 {
					return ErrCardShopNoStock
				}
			}
			if err := tx.Create(order).Error; err != nil {
				return err
			}
			card, err := claimAvailableCardForOrderTx(tx, order.ProductID, order.ID)
			if err != nil {
				return ErrCardShopNoStock
			}
			order.CardID = card.ID
			if err := tx.Save(order).Error; err != nil {
				return err
			}
			return syncProductStockTx(tx, order.ProductID)
		})
	})
}

func releaseExpiredCardOrdersTx(tx *gorm.DB, productID int64, now int64) error {
	query := cardShopForUpdate(tx).Where("status = ? AND expires_at > 0 AND expires_at <= ?", CardShopOrderPending, now)
	if productID > 0 {
		query = query.Where("product_id = ?", productID)
	}
	var orders []*CardOrder
	if err := query.Find(&orders).Error; err != nil {
		return err
	}
	touched := map[int64]struct{}{}
	for _, order := range orders {
		if order.CardID > 0 {
			if err := tx.Model(&Card{}).Where("id = ? AND order_id = ? AND status = ?", order.CardID, order.ID, CardShopCardReserved).Updates(map[string]interface{}{"status": CardShopCardAvailable, "order_id": 0}).Error; err != nil {
				return err
			}
		}
		order.Status = CardShopOrderCancelled
		order.CompleteTime = now
		if err := tx.Save(order).Error; err != nil {
			return err
		}
		touched[order.ProductID] = struct{}{}
	}
	for pid := range touched {
		if err := syncProductStockTx(tx, pid); err != nil {
			return err
		}
	}
	return nil
}

func ReleaseExpiredCardShopOrders() error {
	now := common.GetTimestamp()
	return DB.Transaction(func(tx *gorm.DB) error {
		return releaseExpiredCardOrdersTx(tx, 0, now)
	})
}

func EnsureCardShopCryptoSecretConfigured() error {
	if common.CryptoSecretExplicitlyConfigured {
		return nil
	}
	var count int64
	if err := DB.Model(&Card{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return errors.New("检测到已存在卡商城卡密，但未显式配置 CRYPTO_SECRET：请设置稳定的 CRYPTO_SECRET 环境变量后重启。" +
			"若此前依赖 SESSION_SECRET 加密过卡密，CRYPTO_SECRET 必须设置为与当时相同的值，否则旧卡密将无法解密")
	}
	return nil
}

func UpdateCardOrderPaymentInfo(tradeNo string, expectedAmount int64, currency string, flowOrderNo string) error {
	if strings.TrimSpace(tradeNo) == "" {
		return ErrCardShopOrderNotFound
	}
	updates := map[string]interface{}{
		"expected_amount": expectedAmount,
		"currency":        strings.ToUpper(strings.TrimSpace(currency)),
		"flow_order_no":   strings.TrimSpace(flowOrderNo),
	}
	result := DB.Model(&CardOrder{}).Where("trade_no = ?", tradeNo).Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrCardShopOrderNotFound
	}
	return nil
}

func GetCardOrderByTradeNo(tradeNo string) (*CardOrder, error) {
	if strings.TrimSpace(tradeNo) == "" {
		return nil, ErrCardShopOrderNotFound
	}
	var order CardOrder
	if err := DB.Where("trade_no = ?", tradeNo).First(&order).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCardShopOrderNotFound
		}
		return nil, err
	}
	return &order, nil
}

func GetCardOrderByID(id int64) (*CardOrder, error) {
	if id <= 0 {
		return nil, ErrCardShopOrderNotFound
	}
	var order CardOrder
	if err := DB.Where("id = ?", id).First(&order).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCardShopOrderNotFound
		}
		return nil, err
	}
	return &order, nil
}

func GetCardOrdersByUserID(userID int, pageInfo *common.PageInfo) (orders []*CardOrder, total int64, err error) {
	tx := DB.Model(&CardOrder{}).Where("user_id = ?", userID)
	if err = tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = tx.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&orders).Error
	return orders, total, err
}

func GetAllCardOrders(pageInfo *common.PageInfo, status string) (orders []*CardOrder, total int64, err error) {
	tx := DB.Model(&CardOrder{})
	if strings.TrimSpace(status) != "" {
		tx = tx.Where("status = ?", strings.TrimSpace(status))
	}
	if err = tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = tx.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&orders).Error
	return orders, total, err
}

func DeliverCardOrder(tradeNo string) error {
	if strings.TrimSpace(tradeNo) == "" {
		return ErrCardShopOrderNotFound
	}
	productID, err := getCardOrderProductIDByTradeNo(tradeNo)
	if err != nil {
		return err
	}
	return withCardShopProductLock(productID, func() error {
		return DB.Transaction(func(tx *gorm.DB) error {
			refCol := "`trade_no`"
			if common.UsingPostgreSQL {
				refCol = `"trade_no"`
			}
			order := &CardOrder{}
			if err := cardShopForUpdate(tx).Where(refCol+" = ?", tradeNo).First(order).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrCardShopOrderNotFound
				}
				return err
			}
			return deliverCardOrderLocked(tx, order)
		})
	})
}

func validateCardOrderPaymentLocked(order *CardOrder, paidAmount int64, currency string, flowOrderNo string) error {
	if order.ExpectedAmount > 0 && order.ExpectedAmount != paidAmount {
		return ErrCardShopPaymentMismatch
	}
	expectedCurrency := strings.ToUpper(strings.TrimSpace(order.Currency))
	if expectedCurrency != "" && expectedCurrency != strings.ToUpper(strings.TrimSpace(currency)) {
		return ErrCardShopPaymentMismatch
	}
	expectedFlowOrderNo := strings.TrimSpace(order.FlowOrderNo)
	actualFlowOrderNo := strings.TrimSpace(flowOrderNo)
	if expectedFlowOrderNo != "" && expectedFlowOrderNo != actualFlowOrderNo {
		return ErrCardShopPaymentMismatch
	}
	return nil
}

func CompleteCardOrderPaymentAndDeliver(tradeNo string, paidAmount int64, currency string, flowOrderNo string) error {
	if strings.TrimSpace(tradeNo) == "" {
		return ErrCardShopOrderNotFound
	}
	productID, err := getCardOrderProductIDByTradeNo(tradeNo)
	if err != nil {
		return err
	}
	return withCardShopProductLock(productID, func() error {
		return DB.Transaction(func(tx *gorm.DB) error {
			refCol := "`trade_no`"
			if common.UsingPostgreSQL {
				refCol = `"trade_no"`
			}
			order := &CardOrder{}
			if err := cardShopForUpdate(tx).Where(refCol+" = ?", tradeNo).First(order).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrCardShopOrderNotFound
				}
				return err
			}
			if err := validateCardOrderPaymentLocked(order, paidAmount, currency, flowOrderNo); err != nil {
				return err
			}
			if order.Status == CardShopOrderDelivered && order.CardID > 0 {
				return nil
			}
			if order.Status != CardShopOrderPending && order.Status != CardShopOrderPaid {
				return ErrCardShopOrderStatus
			}
			order.Status = CardShopOrderPaid
			if strings.TrimSpace(order.FlowOrderNo) == "" {
				order.FlowOrderNo = strings.TrimSpace(flowOrderNo)
			}
			if err := tx.Save(order).Error; err != nil {
				return err
			}
			return deliverCardOrderLocked(tx, order)
		})
	})
}

func MarkOrderFailed(tradeNo string) error {
	if strings.TrimSpace(tradeNo) == "" {
		return ErrCardShopOrderNotFound
	}
	productID, err := getCardOrderProductIDByTradeNo(tradeNo)
	if err != nil {
		return err
	}

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	return withCardShopProductLock(productID, func() error {
		return DB.Transaction(func(tx *gorm.DB) error {
			order := &CardOrder{}
			if err := cardShopForUpdate(tx).Where(refCol+" = ?", tradeNo).First(order).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrCardShopOrderNotFound
				}
				return err
			}
			if order.Status != CardShopOrderPending && order.Status != CardShopOrderPaid {
				return nil
			}
			if order.CardID > 0 {
				if err := tx.Model(&Card{}).Where("id = ? AND order_id = ? AND status = ?", order.CardID, order.ID, CardShopCardReserved).Updates(map[string]interface{}{"status": CardShopCardAvailable, "order_id": 0}).Error; err != nil {
					return err
				}
			}
			order.Status = CardShopOrderCancelled
			order.CompleteTime = common.GetTimestamp()
			if err := tx.Save(order).Error; err != nil {
				return err
			}
			return syncProductStockTx(tx, order.ProductID)
		})
	})
}

func ManualDeliverCardOrder(orderID int64, force bool) error {
	if orderID <= 0 {
		return ErrCardShopOrderNotFound
	}
	productID, err := getCardOrderProductIDByID(orderID)
	if err != nil {
		return err
	}
	return withCardShopProductLock(productID, func() error {
		return DB.Transaction(func(tx *gorm.DB) error {
			order := &CardOrder{}
			if err := cardShopForUpdate(tx).Where("id = ?", orderID).First(order).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrCardShopOrderNotFound
				}
				return err
			}
			if order.Status == CardShopOrderPending {
				if !force {
					return ErrCardShopOrderStatus
				}
				order.Status = CardShopOrderPaid
				if err := tx.Save(order).Error; err != nil {
					return err
				}
			}
			return deliverCardOrderLocked(tx, order)
		})
	})
}

func deliverCardOrderLocked(tx *gorm.DB, order *CardOrder) error {
	if order.Status == CardShopOrderDelivered && order.CardID > 0 {
		return nil
	}
	if order.Status != CardShopOrderPaid {
		return ErrCardShopOrderStatus
	}
	if order.CardID <= 0 {
		return ErrCardShopNoStock
	}

	card := &Card{}
	if err := cardShopForUpdate(tx).Where("id = ?", order.CardID).First(card).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrCardShopNoStock
		}
		return err
	}
	if card.Status == CardShopCardSold && card.OrderID == order.ID {
		order.Status = CardShopOrderDelivered
		return tx.Save(order).Error
	}
	if card.Status != CardShopCardReserved || card.OrderID != order.ID {
		return ErrCardShopNoStock
	}

	now := common.GetTimestamp()
	order.Status = CardShopOrderDelivered
	order.CompleteTime = now
	if err := tx.Save(order).Error; err != nil {
		return err
	}

	card.Status = CardShopCardSold
	if err := tx.Save(card).Error; err != nil {
		return err
	}

	return syncProductStockTx(tx, order.ProductID)
}
