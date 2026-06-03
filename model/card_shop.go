package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	CardShopTradeNoPrefix = "CARDSHOP-"

	CardShopCardAvailable = "available"
	CardShopCardSold      = "sold"

	CardShopOrderPending   = "pending"
	CardShopOrderPaid      = "paid"
	CardShopOrderDelivered = "delivered"
	CardShopOrderCancelled = "cancelled"
)

var (
	ErrCardShopProductNotFound = errors.New("商品不存在")
	ErrCardShopCardNotFound    = errors.New("卡密不存在")
	ErrCardShopOrderNotFound   = errors.New("订单不存在")
	ErrCardShopNoStock         = errors.New("商品库存不足")
	ErrCardShopOrderStatus     = errors.New("订单状态不允许发卡")
)

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
	ID           int64   `json:"id" gorm:"primaryKey;autoIncrement"`
	UserID       int     `json:"user_id" gorm:"index;not null"`
	ProductID    int64   `json:"product_id" gorm:"not null"`
	TradeNo      string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	Amount       int64   `json:"amount"`
	Money        float64 `json:"money"`
	Status       string  `json:"status" gorm:"type:varchar(20);default:'pending'"`
	CardID       int64   `json:"card_id" gorm:"default:0"`
	ProductName  string  `json:"product_name" gorm:"type:varchar(255);default:''"`
	CreateTime   int64   `json:"create_time"`
	CompleteTime int64   `json:"complete_time"`
}

func cardShopForUpdate(tx *gorm.DB) *gorm.DB {
	if common.UsingSQLite {
		return tx
	}
	return tx.Clauses(clause.Locking{Strength: "UPDATE"})
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
	var products []*Product
	err := DB.Where("enabled = ? AND stock > 0", true).Order("sort_order desc, id desc").Find(&products).Error
	return products, err
}

func GetAllProducts() ([]*Product, error) {
	var products []*Product
	err := DB.Order("sort_order desc, id desc").Find(&products).Error
	return products, err
}

func BatchCreateCards(productID int64, cards []string) error {
	if productID <= 0 {
		return errors.New("商品ID不能为空")
	}
	if len(cards) == 0 {
		return errors.New("卡密不能为空")
	}

	records := make([]Card, 0, len(cards))
	for _, rawCard := range cards {
		cardContent := strings.TrimSpace(rawCard)
		if cardContent == "" {
			continue
		}
		encrypted, err := common.AESEncrypt(cardContent)
		if err != nil {
			return err
		}
		records = append(records, Card{
			ProductID:   productID,
			CardContent: encrypted,
			CardDisplay: MaskCardContent(cardContent),
			Status:      CardShopCardAvailable,
		})
	}
	if len(records) == 0 {
		return errors.New("有效卡密不能为空")
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.CreateInBatches(records, 500).Error; err != nil {
			return err
		}
		return tx.Model(&Product{}).Where("id = ?", productID).Update("stock", gorm.Expr("stock + ?", len(records))).Error
	})
}

func GetAvailableCard(productID int64) (*Card, error) {
	if productID <= 0 {
		return nil, ErrCardShopCardNotFound
	}
	var card Card
	err := cardShopForUpdate(DB).
		Where("product_id = ? AND status = ?", productID, CardShopCardAvailable).
		Order("id asc").
		First(&card).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCardShopCardNotFound
		}
		return nil, err
	}
	return &card, nil
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

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		order := &CardOrder{}
		if err := cardShopForUpdate(tx).Where(refCol+" = ?", tradeNo).First(order).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrCardShopOrderNotFound
			}
			return err
		}
		return deliverCardOrderLocked(tx, order)
	})
}

func MarkOrderFailed(tradeNo string) error {
	if strings.TrimSpace(tradeNo) == "" {
		return ErrCardShopOrderNotFound
	}

	refCol := "`trade_no`"
	if common.UsingPostgreSQL {
		refCol = `"trade_no"`
	}

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
		order.Status = CardShopOrderCancelled
		order.CompleteTime = common.GetTimestamp()
		return tx.Save(order).Error
	})
}

func ManualDeliverCardOrder(orderID int64) error {
	if orderID <= 0 {
		return ErrCardShopOrderNotFound
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		order := &CardOrder{}
		if err := cardShopForUpdate(tx).Where("id = ?", orderID).First(order).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrCardShopOrderNotFound
			}
			return err
		}
		return deliverCardOrderLocked(tx, order)
	})
}

func deliverCardOrderLocked(tx *gorm.DB, order *CardOrder) error {
	if order.Status == CardShopOrderDelivered && order.CardID > 0 {
		return nil
	}
	if order.Status != CardShopOrderPending && order.Status != CardShopOrderPaid {
		return ErrCardShopOrderStatus
	}

	product := &Product{}
	if err := cardShopForUpdate(tx).Where("id = ?", order.ProductID).First(product).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrCardShopProductNotFound
		}
		return err
	}
	if product.Stock <= 0 {
		return ErrCardShopNoStock
	}

	card := &Card{}
	if err := cardShopForUpdate(tx).
		Where("product_id = ? AND status = ?", order.ProductID, CardShopCardAvailable).
		Order("id asc").
		First(card).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrCardShopNoStock
		}
		return err
	}

	now := common.GetTimestamp()
	order.CardID = card.ID
	order.Status = CardShopOrderDelivered
	order.CompleteTime = now
	if err := tx.Save(order).Error; err != nil {
		return err
	}

	card.Status = CardShopCardSold
	card.OrderID = order.ID
	if err := tx.Save(card).Error; err != nil {
		return err
	}

	result := tx.Model(&Product{}).Where("id = ? AND stock > 0", order.ProductID).Update("stock", gorm.Expr("stock - ?", 1))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrCardShopNoStock
	}
	return nil
}
