package controller

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// maxCardShopProductPrice 是商品价格上限（主货币单位）。设业务上限既防止管理员误填超大值，
// 也把价格远控制在 float64 可精确表示的整数范围（2^53）内，避免 minor unit 换算时精度丢失/溢出。
const maxCardShopProductPrice int64 = 100_000_000

// isValidCardShopImageURL 校验商品图片地址。图片可选（空字符串放行）；非空时必须是 https:// 公网地址，
// 拒绝回环/私网/链路本地地址与无点主机名——商品页对公网访客可见，避免被入侵管理员用于追踪访客 IP 或探测内网。
func isValidCardShopImageURL(raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return true
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return false
	}
	host := u.Hostname()
	if host == "localhost" || !strings.Contains(host, ".") {
		return false
	}
	if ip := net.ParseIP(host); ip != nil {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
			return false
		}
	}
	return true
}

// adminProductRequest 的可选标量字段统一使用指针类型（遵循 Rule 6）：
// nil 表示客户端未提交该字段、应保留既有值；非 nil 才覆盖。
// 注意：库存 stock 完全由卡密数量派生（syncProductStockTx），不接受管理端直接写入，
// 故此处不包含 Stock 字段——避免「手填库存」与「按卡密自动重算」相互覆盖。
type adminProductRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Price       *int64  `json:"price"`
	ImageURL    *string `json:"image_url"`
	Enabled     *bool   `json:"enabled"`
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
	if req.SortOrder != nil {
		product.SortOrder = *req.SortOrder
	}
	if req.Enabled != nil {
		product.Enabled = *req.Enabled
	}
}

func validateAdminProduct(c *gin.Context, product *model.Product) bool {
	if strings.TrimSpace(product.Name) == "" {
		common.ApiErrorMsg(c, "商品名称不能为空")
		return false
	}
	if product.Price <= 0 {
		common.ApiErrorMsg(c, "商品价格必须大于0")
		return false
	}
	if product.Price > maxCardShopProductPrice {
		common.ApiErrorMsg(c, "商品价格超出上限")
		return false
	}
	if !isValidCardShopImageURL(product.ImageURL) {
		common.ApiErrorMsg(c, "商品图片地址必须是 https:// 公网地址")
		return false
	}
	return true
}

func AdminGetAllProducts(c *gin.Context) {
	products, err := model.GetAllProducts()
	if err != nil {
		common.ApiErrorMsg(c, "获取商品列表失败")
		return
	}
	common.ApiSuccess(c, products)
}

func AdminCreateProduct(c *gin.Context) {
	var req adminProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	product := &model.Product{Enabled: true}
	req.applyTo(product)
	if !validateAdminProduct(c, product) {
		return
	}

	if err := model.CreateProduct(product); err != nil {
		common.ApiErrorMsg(c, "创建商品失败")
		return
	}
	common.ApiSuccess(c, product)
}

func AdminUpdateProduct(c *gin.Context) {
	productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || productID <= 0 {
		common.ApiErrorMsg(c, "无效的商品ID")
		return
	}

	var req adminProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	product, err := model.GetProductByID(productID)
	if err != nil {
		common.ApiErrorMsg(c, "商品不存在")
		return
	}
	req.applyTo(product)
	if !validateAdminProduct(c, product) {
		return
	}

	if err := model.UpdateProduct(product); err != nil {
		common.ApiErrorMsg(c, "修改商品失败")
		return
	}
	common.ApiSuccess(c, product)
}

func AdminDeleteProduct(c *gin.Context) {
	productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || productID <= 0 {
		common.ApiErrorMsg(c, "无效的商品ID")
		return
	}

	if err := model.DeleteProduct(productID); err != nil {
		common.ApiErrorMsg(c, "删除商品失败")
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminImportCards(c *gin.Context) {
	productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || productID <= 0 {
		common.ApiErrorMsg(c, "无效的商品ID")
		return
	}

	var req adminImportCardsRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Cards) == 0 {
		common.ApiErrorMsg(c, "卡密不能为空")
		return
	}

	if _, err := model.GetProductByID(productID); err != nil {
		common.ApiErrorMsg(c, "商品不存在")
		return
	}

	added, skipped, err := model.BatchCreateCards(productID, req.Cards)
	if err != nil {
		// B1: 未配置 CRYPTO_SECRET 时向管理员明确报错，而非笼统的「导入失败」。
		if errors.Is(err, model.ErrCardShopCryptoSecretRequired) {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		common.ApiErrorMsg(c, "导入卡密失败")
		return
	}
	// count = 实际新增；skipped = 因批次内/已存在重复而跳过的数量。
	common.ApiSuccess(c, gin.H{"count": added, "skipped": skipped})
}

// AdminPreviewImportCards 试算一批卡密的导入结果（只读、不写入），返回
// {total, batch_dup, existing_dup, new_count}，供前端在导入前把「将导入张数」精确到与入库数一致
// ——尤其是「与该商品既有库存重复」这部分，前端拿不到既有卡密明文、无法自行预判，须由后端试算。
// 与导入接口不同：空卡密不视为错误（管理员清空输入框时返回全 0），避免试算在编辑过程中频繁报错。
func AdminPreviewImportCards(c *gin.Context) {
	productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || productID <= 0 {
		common.ApiErrorMsg(c, "无效的商品ID")
		return
	}

	var req adminImportCardsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	if _, err := model.GetProductByID(productID); err != nil {
		common.ApiErrorMsg(c, "商品不存在")
		return
	}

	preview, err := model.PreviewImportCards(productID, req.Cards)
	if err != nil {
		// 与导入接口一致：未配置 CRYPTO_SECRET 时明确报错（前端据此回退到本地计数）。
		if errors.Is(err, model.ErrCardShopCryptoSecretRequired) {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		common.ApiErrorMsg(c, "试算失败")
		return
	}
	common.ApiSuccess(c, preview)
}

// AdminListCards 返回某商品下的卡密列表（分页，掩码展示），用于管理端「管理卡密」。
func AdminListCards(c *gin.Context) {
	productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || productID <= 0 {
		common.ApiErrorMsg(c, "无效的商品ID")
		return
	}
	if _, err := model.GetProductByID(productID); err != nil {
		common.ApiErrorMsg(c, "商品不存在")
		return
	}
	pageInfo := common.GetPageQuery(c)
	cards, total, err := model.ListCardsByProduct(productID, pageInfo)
	if err != nil {
		common.ApiErrorMsg(c, "获取卡密列表失败")
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(cards)
	common.ApiSuccess(c, pageInfo)
}

// AdminDeleteCard 删除一张未售出且未锁定的卡密，删除后库存自动重算。
func AdminDeleteCard(c *gin.Context) {
	cardID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || cardID <= 0 {
		common.ApiErrorMsg(c, "无效的卡密ID")
		return
	}
	if err := model.DeleteCard(cardID); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminGetAllCardOrders(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	status := strings.TrimSpace(c.Query("status"))
	orders, total, err := model.GetAllCardOrders(pageInfo, status)
	if err != nil {
		common.ApiErrorMsg(c, "获取订单列表失败")
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(orders)
	common.ApiSuccess(c, pageInfo)
}

func AdminManualDeliver(c *gin.Context) {
	orderID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || orderID <= 0 {
		common.ApiErrorMsg(c, "无效的订单ID")
		return
	}

	order, err := model.GetCardOrderByID(orderID)
	if err != nil {
		common.ApiErrorMsg(c, "订单不存在")
		return
	}

	var req adminManualDeliverRequest
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			common.ApiErrorMsg(c, "参数错误")
			return
		}
	}
	if order.Status == model.CardShopOrderPending && !req.Force {
		common.ApiErrorMsg(c, "订单未支付，不能手动发卡")
		return
	}

	LockOrder(order.TradeNo)
	defer UnlockOrder(order.TradeNo)

	if err := model.ManualDeliverCardOrder(orderID, req.Force); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("管理员手动补发卡密 order_id=%d user_id=%d force=%t reason=%q", orderID, order.UserID, req.Force, strings.TrimSpace(req.Reason)))
	model.RecordLog(order.UserID, model.LogTypeSystem, fmt.Sprintf("管理员手动发卡 order_id=%d force=%t reason=%s", orderID, req.Force, strings.TrimSpace(req.Reason)))
	common.ApiSuccess(c, nil)
}
