package controller

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/thanhpk/randstr"
)

type SubscriptionConfluxAPIPayRequest struct {
	PlanId int `json:"plan_id"`
}

// SubscriptionRequestConfluxAPIPay creates a pending subscription order and a
// ConfluxAPI checkout for it. The plan price IS the charge (in the gateway's
// configured currency), unlike top-up which converts quota to money. Webhook
// completion happens in ConfluxAPINotify, routed by the SUBCONFLUX- prefix.
func SubscriptionRequestConfluxAPIPay(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	// Same availability gate as top-up and card shop: enabled + webhook configured.
	if !setting.ConfluxAPIEnabled || !isConfluxAPITopUpEnabled() {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("订阅 ConfluxAPI 支付不可用 conflux_enabled=%t topup_ready=%t", setting.ConfluxAPIEnabled, isConfluxAPITopUpEnabled()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "Conflux 支付未启用"})
		return
	}

	var req SubscriptionConfluxAPIPayRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PlanId <= 0 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}

	plan, err := model.GetSubscriptionPlanById(req.PlanId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !plan.Enabled {
		common.ApiErrorMsg(c, "套餐未启用")
		return
	}
	if plan.PriceAmount <= 0 {
		common.ApiErrorMsg(c, "套餐价格无效")
		return
	}

	userId := c.GetInt("id")
	user, err := model.GetUserById(userId, false)
	if err != nil || user == nil {
		common.ApiErrorMsg(c, "用户不存在")
		return
	}

	if plan.MaxPurchasePerUser > 0 {
		count, err := model.CountUserSubscriptionsByPlan(userId, plan.Id)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		if count >= int64(plan.MaxPurchasePerUser) {
			common.ApiErrorMsg(c, "已达到该套餐购买上限")
			return
		}
	}

	currency := getConfluxAPICurrency()
	formattedAmount := formatConfluxAPIAmount(plan.PriceAmount, currency)
	if formattedAmount <= 0 {
		common.ApiErrorMsg(c, "支付金额过低")
		return
	}

	tradeNo := fmt.Sprintf("%s%d-%d-%s", model.SubscriptionConfluxAPITradeNoPrefix, userId, time.Now().UnixMilli(), randstr.String(6))
	order := &model.SubscriptionOrder{
		UserId:          userId,
		PlanId:          plan.Id,
		Money:           plan.PriceAmount,
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodConfluxAPI,
		PaymentProvider: model.PaymentProviderConfluxAPI,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := order.Insert(); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("订阅 ConfluxAPI 创建订单失败 user_id=%d plan_id=%d trade_no=%s error=%q", userId, plan.Id, tradeNo, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}

	notifyURL, err := getConfluxAPINotifyURL()
	if err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("订阅 ConfluxAPI 异步通知地址未配置 user_id=%d trade_no=%s error=%q", userId, tradeNo, err.Error()))
		_ = model.ExpireSubscriptionOrder(tradeNo, model.PaymentProviderConfluxAPI)
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "异步通知地址未配置"})
		return
	}

	returnURL := firstNonEmpty(strings.TrimSpace(setting.ConfluxAPIReturnURL), paymentReturnPath("/payment/success"))
	cancelURL := firstNonEmpty(strings.TrimSpace(setting.ConfluxAPICancelURL), paymentReturnPath("/console/topup"))
	paymentReq := confluxAPICreatePaymentRequest{
		MchNo:       strings.TrimSpace(setting.ConfluxAPIMchNo),
		GatewayNo:   strings.TrimSpace(setting.ConfluxAPIGatewayNo),
		MchOrderNo:  tradeNo,
		Amount:      formattedAmount,
		Currency:    currency,
		ReturnURL:   returnURL,
		CancelURL:   cancelURL,
		NotifyURL:   notifyURL,
		Description: fmt.Sprintf("Subscription %s", plan.Title),
		Locale:      getConfluxAPILanguage(c),
		Customer: &confluxAPICustomer{
			ID:    fmt.Sprintf("user_%d", userId),
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
				Name:       plan.Title,
				Quantity:   1,
				UnitAmount: formattedAmount,
				Amount:     formattedAmount,
				Currency:   currency,
			},
		},
		CustomParams: map[string]any{
			"user_id":    userId,
			"plan_id":    plan.Id,
			"order_type": "subscription",
		},
	}

	paymentResp, err := createConfluxAPIPayment(paymentReq)
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("订阅 ConfluxAPI 创建支付订单失败 user_id=%d trade_no=%s error=%q", userId, tradeNo, err.Error()))
		_ = model.ExpireSubscriptionOrder(tradeNo, model.PaymentProviderConfluxAPI)
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}

	if !paymentResp.Success || paymentResp.Code != "0000" {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("订阅 ConfluxAPI 创建支付订单业务失败 user_id=%d trade_no=%s code=%s message=%q", userId, tradeNo, paymentResp.Code, paymentResp.Message))
		_ = model.ExpireSubscriptionOrder(tradeNo, model.PaymentProviderConfluxAPI)
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": firstNonEmpty(paymentResp.Message, "拉起支付失败")})
		return
	}

	if strings.EqualFold(paymentResp.Data.TradeStatus, "FAILED") {
		_ = model.ExpireSubscriptionOrder(tradeNo, model.PaymentProviderConfluxAPI)
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": firstNonEmpty(paymentResp.Data.FailReason, "拉起支付失败")})
		return
	}

	if strings.TrimSpace(paymentResp.Data.MchOrderNo) != "" && paymentResp.Data.MchOrderNo != tradeNo {
		_ = model.ExpireSubscriptionOrder(tradeNo, model.PaymentProviderConfluxAPI)
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "支付订单号不匹配"})
		return
	}
	if paymentResp.Data.Amount > 0 && paymentResp.Data.Amount != formattedAmount {
		_ = model.ExpireSubscriptionOrder(tradeNo, model.PaymentProviderConfluxAPI)
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "支付金额不匹配"})
		return
	}

	paymentURL := firstNonEmpty(paymentResp.Data.CheckoutURL, paymentResp.Data.PaymentURL, paymentResp.Data.NextAction.URL, paymentResp.Data.NextAction.QRCode)
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("订阅 ConfluxAPI 收银台创建成功 user_id=%d plan_id=%d trade_no=%s flow_order_no=%s money=%.2f", userId, plan.Id, tradeNo, paymentResp.Data.FlowOrderNo, plan.PriceAmount))
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data": gin.H{
			"payment_url":   paymentURL,
			"action_type":   paymentResp.Data.NextAction.Type,
			"qr_code":       paymentResp.Data.NextAction.QRCode,
			"checkout_url":  firstNonEmpty(paymentResp.Data.CheckoutURL, paymentResp.Data.NextAction.URL),
			"flow_order_no": paymentResp.Data.FlowOrderNo,
			"order_id":      tradeNo,
		},
	})
}
