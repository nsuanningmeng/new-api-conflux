package controller

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// adminProductRequest 的可选标量字段统一使用指针类型（遵循 Rule 6）：
// nil 表示客户端未提交该字段、应保留既有值；非 nil 才覆盖。
// 这样 partial PUT（仅提交部分字段）不会把未提交字段静默清空。
type adminProductRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Price       *int64  `json:"price"`
	ImageURL    *string `json:"image_url"`
	Enabled     *bool   `json:"enabled"`
	Stock       *int    `json:"stock"`
	SortOrder   *int    `json:"sort_order"`
}

type adminImportCardsRequest struct {
	Cards []string `json:"cards"`
}

type adminManualDeliverRequest struct {
	Force  bool   `json:"force"`
	Reason string `json:"reason"`
}

func (req adminProductRequest) applyTo(product *model.Product) {
	if req.Name != nil {
		product.Name = strings.TrimSpace(*req.Name)
	}
	if req.Description != nil {
		product.Description = strings.TrimSpace(*req.Description)
	}
	if req.Price != nil {
		product.Price = *req.Price
	}
	if req.ImageURL != nil {
		product.ImageURL = strings.TrimSpace(*req.ImageURL)
	}
	if req.Stock != nil {
		product.Stock = *req.Stock
	}
	if req.SortOrder != nil {
		product.SortOrder = *req.SortOrder
	}
	if req.Enabled != nil {
		product.Enabled = *req.Enabled
	}
}

func validateAdminProduct(c *gin.Context, product *model.Product) bool {
	if strings.TrimSpace(product.Name) == "" {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "商品名称不能为空"})
		return false
	}
	if product.Price <= 0 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "商品价格必须大于0"})
		return false
	}
	if product.Stock < 0 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "库存不能为负数"})
		return false
	}
	return true
}

func AdminGetAllProducts(c *gin.Context) {
	products, err := model.GetAllProducts()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取商品列表失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": products})
}

func AdminCreateProduct(c *gin.Context) {
	var req adminProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}

	product := &model.Product{Enabled: true}
	req.applyTo(product)
	if !validateAdminProduct(c, product) {
		return
	}

	if err := model.CreateProduct(product); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建商品失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": product})
}

func AdminUpdateProduct(c *gin.Context) {
	productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || productID <= 0 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "无效的商品ID"})
		return
	}

	var req adminProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}

	product, err := model.GetProductByID(productID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "商品不存在"})
		return
	}
	req.applyTo(product)
	if !validateAdminProduct(c, product) {
		return
	}

	if err := model.UpdateProduct(product); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "修改商品失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": product})
}

func AdminDeleteProduct(c *gin.Context) {
	productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || productID <= 0 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "无效的商品ID"})
		return
	}

	if err := model.DeleteProduct(productID); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "删除商品失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": nil})
}

func AdminImportCards(c *gin.Context) {
	productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || productID <= 0 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "无效的商品ID"})
		return
	}

	var req adminImportCardsRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Cards) == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "卡密不能为空"})
		return
	}

	if _, err := model.GetProductByID(productID); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "商品不存在"})
		return
	}

	count, err := model.BatchCreateCards(productID, req.Cards)
	if err != nil {
		// B1: 未配置 CRYPTO_SECRET 时向管理员明确报错，而非笼统的「导入失败」。
		if errors.Is(err, model.ErrCardShopCryptoSecretRequired) {
			c.JSON(http.StatusOK, gin.H{"message": "error", "data": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "导入卡密失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": gin.H{"count": count}})
}

func AdminGetAllCardOrders(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	status := strings.TrimSpace(c.Query("status"))
	orders, total, err := model.GetAllCardOrders(pageInfo, status)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取订单列表失败"})
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(orders)
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": pageInfo})
}

func AdminManualDeliver(c *gin.Context) {
	orderID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || orderID <= 0 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "无效的订单ID"})
		return
	}

	order, err := model.GetCardOrderByID(orderID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "订单不存在"})
		return
	}

	var req adminManualDeliverRequest
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
			return
		}
	}
	if order.Status == model.CardShopOrderPending && !req.Force {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "订单未支付，不能手动发卡"})
		return
	}

	LockOrder(order.TradeNo)
	defer UnlockOrder(order.TradeNo)

	if err := model.ManualDeliverCardOrder(orderID, req.Force); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": err.Error()})
		return
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("管理员手动补发卡密 order_id=%d user_id=%d force=%t reason=%q", orderID, order.UserID, req.Force, strings.TrimSpace(req.Reason)))
	model.RecordLog(order.UserID, model.LogTypeSystem, fmt.Sprintf("管理员手动发卡 order_id=%d force=%t reason=%s", orderID, req.Force, strings.TrimSpace(req.Reason)))
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": nil})
}
