package model

import (
	"errors"
	"strings"
	"sync"

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
	ID             int64   `json:"id" gorm:"primaryKey;autoIncrement"`
	UserID         int     `json:"user_id" gorm:"index;not null"`
	ProductID      int64   `json:"product_id" gorm:"not null"`
	TradeNo        string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	Amount         int64   `json:"amount"`
	Money          float64 `json:"money"`
	Status         string  `json:"status" gorm:"type:varchar(20);default:'pending'"`
	CardID         int64   `json:"card_id" gorm:"default:0"`
	ExpectedAmount int64   `json:"expected_amount" gorm:"default:0"`
	Currency       string  `json:"currency" gorm:"type:varchar(16);default:''"`
	FlowOrderNo    string  `json:"flow_order_no" gorm:"type:varchar(255);default:''"`
	ExpiresAt      int64   `json:"expires_at" gorm:"index;default:0"`
	ProductName    string  `json:"product_name" gorm:"type:varchar(255);default:''"`
	CreateTime     int64   `json:"create_time"`
	CompleteTime   int64   `json:"complete_time"`
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
	_ = ReleaseExpiredCardShopOrders()
	var products []*Product
	err := DB.Where("enabled = ? AND stock > 0", true).Order("sort_order desc, id desc").Find(&products).Error
	return products, err
}

func GetAllProducts() ([]*Product, error) {
	var products []*Product
	err := DB.Order("sort_order desc, id desc").Find(&products).Error
	return products, err
}

func BatchCreateCards(productID int64, cards []string) (int, error) {
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
		return errors.New("CRYPTO_SECRET must be explicitly configured when card shop cards exist")
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
