package model

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
)

type CardShopAnalyticsResult struct {
	TotalRevenue      int64                       `json:"total_revenue"`
	TotalOrders       int64                       `json:"total_orders"`
	DeliveredOrders   int64                       `json:"delivered_orders"`
	CancelledOrders   int64                       `json:"cancelled_orders"`
	AvgOrderValue     float64                     `json:"avg_order_value"`
	TopProducts       []CardShopTopProductResult   `json:"top_products"`
	RevenueBreakdown  []CardShopRevenuePointResult `json:"revenue_breakdown"`
}

type CardShopTopProductResult struct {
	ProductID   int64  `json:"product_id"`
	ProductName string `json:"product_name"`
	OrderCount  int64  `json:"order_count"`
	Revenue     int64  `json:"revenue"`
}

type CardShopRevenuePointResult struct {
	Date    string `json:"date"`
	Revenue int64  `json:"revenue"`
	Orders  int64  `json:"orders"`
}

func GetCardShopAnalytics(startTime, endTime int64) (*CardShopAnalyticsResult, error) {
	var result CardShopAnalyticsResult

	err := DB.Model(&CardOrder{}).
		Where("create_time >= ? AND create_time <= ?", startTime, endTime).
		Select("COALESCE(SUM(amount), 0) as total_revenue, COUNT(*) as total_orders").
		Scan(&result).Error
	if err != nil {
		return nil, err
	}

	err = DB.Model(&CardOrder{}).
		Where("create_time >= ? AND create_time <= ? AND status = ?", startTime, endTime, CardShopOrderDelivered).
		Count(&result.DeliveredOrders).Error
	if err != nil {
		return nil, err
	}

	err = DB.Model(&CardOrder{}).
		Where("create_time >= ? AND create_time <= ? AND status = ?", startTime, endTime, CardShopOrderCancelled).
		Count(&result.CancelledOrders).Error
	if err != nil {
		return nil, err
	}

	if result.TotalOrders > 0 {
		result.AvgOrderValue = float64(result.TotalRevenue) / float64(result.TotalOrders)
	}

	var topProducts []CardShopTopProductResult
	if err := DB.Model(&CardOrder{}).
		Where("create_time >= ? AND create_time <= ? AND status = ?", startTime, endTime, CardShopOrderDelivered).
		Select("product_id, product_name, COUNT(*) as order_count, COALESCE(SUM(amount), 0) as revenue").
		Group("product_id, product_name").
		Order("revenue DESC").
		Limit(5).
		Scan(&topProducts).Error; err != nil {
		return nil, err
	}
	result.TopProducts = topProducts

	return &result, nil
}

func GetCardShopRevenueBreakdown(startTime, endTime int64, period string) ([]CardShopRevenuePointResult, error) {
	var results []CardShopRevenuePointResult

	var dateExpr string
	switch period {
	case "weekly":
		dateExpr = cardShopRevenueWeekExpr()
	case "monthly":
		dateExpr = cardShopRevenueMonthExpr()
	default:
		dateExpr = cardShopRevenueDayExpr()
	}

	selectSQL := fmt.Sprintf("%s as date, COALESCE(SUM(amount), 0) as revenue, COUNT(*) as orders", dateExpr)

	err := DB.Model(&CardOrder{}).
		Where("create_time >= ? AND create_time <= ? AND status = ?", startTime, endTime, CardShopOrderDelivered).
		Select(selectSQL).
		Group("date").
		Order("date ASC").
		Scan(&results).Error
	if err != nil {
		return nil, err
	}
	return results, nil
}

func cardShopRevenueDayExpr() string {
	if common.UsingPostgreSQL {
		return "TO_CHAR(TO_TIMESTAMP(create_time), 'YYYY-MM-DD')"
	}
	if common.UsingMySQL {
		return "DATE_FORMAT(FROM_UNIXTIME(create_time), '%Y-%m-%d')"
	}
	return "strftime('%Y-%m-%d', datetime(create_time, 'unixepoch'))"
}

func cardShopRevenueWeekExpr() string {
	if common.UsingPostgreSQL {
		return "TO_CHAR(TO_TIMESTAMP(create_time), 'IYYY-\"W\"IW')"
	}
	if common.UsingMySQL {
		return "DATE_FORMAT(FROM_UNIXTIME(create_time), '%Y-W%v')"
	}
	return "strftime('%Y-W%W', datetime(create_time, 'unixepoch'))"
}

func cardShopRevenueMonthExpr() string {
	if common.UsingPostgreSQL {
		return "TO_CHAR(TO_TIMESTAMP(create_time), 'YYYY-MM')"
	}
	if common.UsingMySQL {
		return "DATE_FORMAT(FROM_UNIXTIME(create_time), '%Y-%m')"
	}
	return "strftime('%Y-%m', datetime(create_time, 'unixepoch'))"
}
