package controller

import (
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

type cardShopAnalyticsRequest struct {
	StartTime *int64 `json:"start_time" form:"start_time"`
	EndTime   *int64 `json:"end_time" form:"end_time"`
	Period    string `json:"period" form:"period"` // daily, weekly, monthly
}

type cardShopAnalyticsResponse struct {
	TotalRevenue      int64                 `json:"total_revenue"`
	TotalOrders       int64                 `json:"total_orders"`
	DeliveredOrders   int64                 `json:"delivered_orders"`
	CancelledOrders   int64                 `json:"cancelled_orders"`
	AvgOrderValue     float64               `json:"avg_order_value"`
	TopProducts       []cardShopTopProduct  `json:"top_products"`
	RevenueBreakdown  []cardShopRevenuePoint `json:"revenue_breakdown"`
}

type cardShopTopProduct struct {
	ProductID   int64  `json:"product_id"`
	ProductName string `json:"product_name"`
	OrderCount  int64  `json:"order_count"`
	Revenue     int64  `json:"revenue"`
}

type cardShopRevenuePoint struct {
	Date    string `json:"date"`
	Revenue int64  `json:"revenue"`
	Orders  int64  `json:"orders"`
}

func AdminGetCardShopAnalytics(c *gin.Context) {
	var req cardShopAnalyticsRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}

	now := common.GetTimestamp()
	var startTime, endTime int64

	if req.StartTime != nil && *req.StartTime > 0 {
		startTime = *req.StartTime
	}
	if req.EndTime != nil && *req.EndTime > 0 {
		endTime = *req.EndTime
	}

	if startTime <= 0 && endTime <= 0 {
		switch req.Period {
		case "daily":
			startTime = beginningOfDay(now)
			endTime = now
		case "weekly":
			startTime = beginningOfWeek(now)
			endTime = now
		case "monthly":
			startTime = beginningOfMonth(now)
			endTime = now
		default:
			startTime = beginningOfDay(now)
			endTime = now
		}
	} else if startTime <= 0 {
		startTime = endTime - 86400*30
	} else if endTime <= 0 {
		endTime = now
	}

	if startTime > endTime {
		startTime, endTime = endTime, startTime
	}

	stats, err := model.GetCardShopAnalytics(startTime, endTime)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取统计数据失败"})
		return
	}

	breakdown, err := model.GetCardShopRevenueBreakdown(startTime, endTime, req.Period)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取收入明细失败"})
		return
	}
	stats.RevenueBreakdown = breakdown

	c.JSON(http.StatusOK, gin.H{"message": "success", "data": stats})
}

func beginningOfDay(ts int64) int64 {
	t := time.Unix(ts, 0)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location()).Unix()
}

func beginningOfWeek(ts int64) int64 {
	t := time.Unix(ts, 0)
	weekday := t.Weekday()
	daysToMonday := int(weekday) - 1
	if daysToMonday < 0 {
		daysToMonday = 6
	}
	monday := time.Date(t.Year(), t.Month(), t.Day()-daysToMonday, 0, 0, 0, 0, t.Location())
	return monday.Unix()
}

func beginningOfMonth(ts int64) int64 {
	t := time.Unix(ts, 0)
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, t.Location()).Unix()
}

func AdminGetCardShopDailyTrend(c *gin.Context) {
	period := "daily"
	if p := c.Query("period"); p != "" {
		period = p
	}

	now := common.GetTimestamp()
	var startTime int64
	switch period {
	case "weekly":
		startTime = beginningOfWeek(now)
	case "monthly":
		startTime = beginningOfMonth(now)
	default:
		startTime = beginningOfDay(now)
	}

	breakdown, err := model.GetCardShopRevenueBreakdown(startTime, now, period)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取趋势失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": breakdown})
}
