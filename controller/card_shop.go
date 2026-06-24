package controller

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/thanhpk/randstr"
)

type createCardShopOrderRequest struct {
	ProductID int64 `json:"product_id"`
}

func GetCardShopProducts(c *gin.Context) {
	products, err := model.GetAllEnabledProducts()
	if err != nil {
		common.ApiErrorMsg(c, "获取商品列表失败")
		return
	}
	common.ApiSuccess(c, products)
}

func GetCardShopProduct(c *gin.Context) {
	productID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || productID <= 0 {
		common.ApiErrorMsg(c, "无效的商品ID")
		return
	}
	product, err := model.GetProductByID(productID)
	if err != nil || product == nil || !product.Enabled {
		common.ApiErrorMsg(c, "商品不存在")
		return
	}
	common.ApiSuccess(c, product)
}

func CreateCardShopOrder(c *gin.Context) {
	// 支付通道可用性合并为一次校验：对用户给出友好提示，详细原因仅写入日志。
	topupReady := isConfluxAPITopUpEnabled()
	if !setting.ConfluxAPIEnabled || !topupReady {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("CardShop 支付不可用 conflux_enabled=%t topup_ready=%t", setting.ConfluxAPIEnabled, topupReady))
		common.ApiErrorMsg(c, "AI 账号支付暂未开放，请联系管理员")
		return
	}

	var req createCardShopOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.ProductID <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	product, err := model.GetProductByID(req.ProductID)
	if err != nil || product == nil {
		common.ApiErrorMsg(c, "商品不存在")
		return
	}
	if !product.Enabled {
		common.ApiErrorMsg(c, "商品已下架")
		return
	}
	if product.Stock <= 0 {
		common.ApiErrorMsg(c, "商品库存不足")
		return
	}
	if product.Price <= 0 {
		common.ApiErrorMsg(c, "商品价格无效")
		return
	}

	userID := c.GetInt("id")
	user, err := model.GetUserById(userID, false)
	if err != nil || user == nil {
		common.ApiErrorMsg(c, "用户不存在")
		return
	}

	payMoney := getCardShopPayMoney(product.Price)
	if payMoney < 0.01 {
		common.ApiErrorMsg(c, "支付金额过低")
		return
	}

	currency := getConfluxAPICurrency()
	formattedAmount := formatConfluxAPIAmount(payMoney, currency)
	tradeNo := fmt.Sprintf("%s%d-%d-%s", model.CardShopTradeNoPrefix, userID, time.Now().UnixMilli(), randstr.String(6))
	order := &model.CardOrder{
		UserID:         userID,
		ProductID:      product.ID,
		TradeNo:        tradeNo,
		Amount:         product.Price,
		Money:          payMoney,
		Status:         model.CardShopOrderPending,
		ExpectedAmount: formattedAmount,
		Currency:       currency,
		ProductName:    product.Name,
		CreateTime:     common.GetTimestamp(),
	}
	if err := model.CreateReservedCardOrder(order); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("CardShop 创建订单失败 user_id=%d product_id=%d trade_no=%s error=%q", userID, product.ID, tradeNo, err.Error()))
		common.ApiErrorMsg(c, "创建订单失败")
		return
	}

	notifyURL, err := getConfluxAPINotifyURL()
	if err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("CardShop ConfluxAPI 异步通知地址未配置 user_id=%d trade_no=%s error=%q", userID, tradeNo, err.Error()))
		_ = model.MarkOrderFailed(tradeNo)
		common.ApiErrorMsg(c, "异步通知地址未配置")
		return
	}

	// 发卡专用回跳：携带 order_id 指向卡密展示页，让用户支付完成后直接看到卡密，无需再去历史订单。
	// 不复用充值的全局 ConfluxAPIReturnURL——那是充值通用成功页，无轮询/无法展示卡密。
	// order.ID 在上面 CreateReservedCardOrder 后已填充；详情接口按 order.UserID 归属校验，
	// URL 暴露 order_id 不构成越权（他人 id 仍 404）。
	// 回跳地址优先沿用管理员配置的 ConfluxAPIReturnURL 的对外 origin（仅替换路径为发卡专属页），
	// 避免「ServerAddress 为内网/与对外回跳域名不一致」时回跳失败；未配置时回退 ServerAddress（见 cardShopReturnURL）。
	// 取消固定回 /card-shop，不复用充值/订阅共享的全局 ConfluxAPICancelURL（默认 /console/topup，可能指向钱包/充值页）。
	returnURL := cardShopReturnURL(fmt.Sprintf("/card-shop/success?order_id=%d", order.ID))
	cancelURL := cardShopReturnURL("/card-shop")
	// 让网关支付链接有效期与本地订单 TTL 对齐：超过 TTL 后网关拒绝支付，
	// 避免「迟付命中已取消订单」导致用户已扣款却拿不到卡（详见 model.CompleteCardOrderPaymentAndDeliver 兜底）。
	cardShopExpiresIn := model.CardShopOrderTTLSeconds
	paymentReq := confluxAPICreatePaymentRequest{
		MchNo:       strings.TrimSpace(setting.ConfluxAPIMchNo),
		GatewayNo:   strings.TrimSpace(setting.ConfluxAPIGatewayNo),
		MchOrderNo:  tradeNo,
		ExpiresIn:   &cardShopExpiresIn,
		Amount:      formattedAmount,
		Currency:    currency,
		ReturnURL:   returnURL,
		CancelURL:   cancelURL,
		NotifyURL:   notifyURL,
		Description: fmt.Sprintf("Card shop product %s", product.Name),
		Locale:      getConfluxAPILanguage(c),
		Customer: &confluxAPICustomer{
			ID:    fmt.Sprintf("user_%d", userID),
			Email: strings.TrimSpace(user.Email),
			Name:  firstNonEmpty(strings.TrimSpace(user.DisplayName), strings.TrimSpace(user.Username)),
		},
		DeviceInfo: &confluxAPIDeviceInfo{
			ClientIP:    getConfluxAPIClientIP(c),
			BrowserInfo: getConfluxAPIBrowserInfo(c),
			Language:    getConfluxAPILanguage(c),
		},
		LineItems: []confluxAPILineItem{
			{
				Name:        product.Name,
				Description: product.Description,
				Quantity:    1,
				UnitAmount:  formattedAmount,
				Amount:      formattedAmount,
				Currency:    currency,
			},
		},
		CustomParams: map[string]any{
			"user_id":    userID,
			"product_id": product.ID,
			"order_type": "cardshop",
		},
	}

	paymentResp, err := createConfluxAPIPayment(paymentReq)
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("CardShop ConfluxAPI 创建支付订单失败 user_id=%d trade_no=%s error=%q", userID, tradeNo, err.Error()))
		_ = model.MarkOrderFailed(tradeNo)
		common.ApiErrorMsg(c, "拉起支付失败")
		return
	}

	if !paymentResp.Success || paymentResp.Code != "0000" {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("CardShop ConfluxAPI 创建支付订单业务失败 user_id=%d trade_no=%s code=%s message=%q", userID, tradeNo, paymentResp.Code, paymentResp.Message))
		_ = model.MarkOrderFailed(tradeNo)
		common.ApiErrorMsg(c, firstNonEmpty(paymentResp.Message, "拉起支付失败"))
		return
	}

	if strings.EqualFold(paymentResp.Data.TradeStatus, "FAILED") {
		_ = model.MarkOrderFailed(tradeNo)
		common.ApiErrorMsg(c, firstNonEmpty(paymentResp.Data.FailReason, "拉起支付失败"))
		return
	}

	if strings.TrimSpace(paymentResp.Data.MchOrderNo) != "" && paymentResp.Data.MchOrderNo != tradeNo {
		_ = model.MarkOrderFailed(tradeNo)
		common.ApiErrorMsg(c, "支付订单号不匹配")
		return
	}
	if paymentResp.Data.Amount > 0 && paymentResp.Data.Amount != formattedAmount {
		_ = model.MarkOrderFailed(tradeNo)
		common.ApiErrorMsg(c, "支付金额不匹配")
		return
	}
	if err := model.UpdateCardOrderPaymentInfo(tradeNo, formattedAmount, currency, paymentResp.Data.FlowOrderNo); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("CardShop 保存支付订单信息失败 user_id=%d trade_no=%s error=%q", userID, tradeNo, err.Error()))
		common.ApiErrorMsg(c, "保存支付订单失败")
		return
	}

	paymentURL := firstNonEmpty(paymentResp.Data.CheckoutURL, paymentResp.Data.PaymentURL, paymentResp.Data.NextAction.URL, paymentResp.Data.NextAction.QRCode)
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("CardShop ConfluxAPI 收银台创建成功 user_id=%d product_id=%d trade_no=%s flow_order_no=%s amount=%d money=%.2f", userID, product.ID, tradeNo, paymentResp.Data.FlowOrderNo, product.Price, payMoney))
	common.ApiSuccess(c, gin.H{
		"payment_url":   paymentURL,
		"action_type":   paymentResp.Data.NextAction.Type,
		"qr_code":       paymentResp.Data.NextAction.QRCode,
		"checkout_url":  firstNonEmpty(paymentResp.Data.CheckoutURL, paymentResp.Data.NextAction.URL),
		"flow_order_no": paymentResp.Data.FlowOrderNo,
		"trade_no":      tradeNo,
		"order_id":      order.ID,
	})
}

func GetCardShopOrders(c *gin.Context) {
	userID := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	orders, total, err := model.GetCardOrdersByUserID(userID, pageInfo)
	if err != nil {
		common.ApiErrorMsg(c, "获取订单列表失败")
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(orders)
	common.ApiSuccess(c, pageInfo)
}

func GetCardShopOrderDetail(c *gin.Context) {
	orderID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || orderID <= 0 {
		common.ApiErrorMsg(c, "无效的订单ID")
		return
	}

	order, err := model.GetCardOrderByID(orderID)
	if err != nil || order == nil || order.UserID != c.GetInt("id") {
		common.ApiErrorMsg(c, "订单不存在")
		return
	}

	data := gin.H{"order": order}
	if order.Status == model.CardShopOrderDelivered && order.CardID > 0 {
		card, err := model.GetCardByID(order.CardID)
		if err != nil {
			common.ApiErrorMsg(c, "卡密解密失败")
			return
		}
		data["card"] = gin.H{
			"id":           card.ID,
			"card_content": card.CardContent,
			"card_display": card.CardDisplay,
			"status":       card.Status,
		}
	}
	common.ApiSuccess(c, data)
}

func getCardShopPayMoney(productPrice int64) float64 {
	return float64(productPrice)
}

// cardShopReturnURL 构造发卡支付的回跳地址。优先沿用管理员配置的 ConfluxAPIReturnURL 的 scheme://host
// 作为对外 origin（仅替换路径），兼容「ServerAddress 为内网 / 与对外回跳域名不一致」的部署；当其未配置或
// 不含合法 scheme/host 时，回退到基于 ServerAddress 的 paymentReturnPath。两条路径都经 ThemeAwarePath 处理。
func cardShopReturnURL(suffix string) string {
	if base := strings.TrimSpace(setting.ConfluxAPIReturnURL); base != "" {
		if u, err := url.Parse(base); err == nil && u.Scheme != "" && u.Host != "" {
			return u.Scheme + "://" + u.Host + common.ThemeAwarePath(suffix)
		}
	}
	return paymentReturnPath(suffix)
}
