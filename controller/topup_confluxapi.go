package controller

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/thanhpk/randstr"
)

const (
	confluxAPICheckoutCreatePath = "/api/v1/checkout/create"
)

const confluxAPICardShopWebhookMaxAgeSeconds int64 = 5 * 60
var processedConfluxAPICardShopNotifyIDs sync.Map

type ConfluxAPIPayRequest struct {
	Amount int64 `json:"amount"`
}

type confluxAPICreatePaymentRequest struct {
	MchNo          string                  `json:"mch_no"`
	GatewayNo      string                  `json:"gateway_no"`
	MchOrderNo     string                  `json:"mch_order_no"`
	Amount         int64                   `json:"amount"`
	Currency       string                  `json:"currency"`
	ReturnURL      string                  `json:"return_url,omitempty"`
	CancelURL      string                  `json:"cancel_url,omitempty"`
	NotifyURL      string                  `json:"notify_url,omitempty"`
	Description    string                  `json:"description,omitempty"`
	ExpiresIn      *int64                  `json:"expires_in,omitempty"`
	Locale         string                  `json:"locale,omitempty"`
	Customer       *confluxAPICustomer     `json:"customer,omitempty"`
	BillingInfo    *confluxAPIBillingInfo  `json:"billing_info,omitempty"`
	ShippingInfo   *confluxAPIShippingInfo `json:"shipping_info,omitempty"`
	LineItems      []confluxAPILineItem    `json:"line_items,omitempty"`
	DiscountAmount *int64                  `json:"discount_amount,omitempty"`
	CustomParams   map[string]any          `json:"custom_params,omitempty"`
	ChannelParams  map[string]any          `json:"channel_params,omitempty"`
	DeviceInfo     *confluxAPIDeviceInfo   `json:"device_info,omitempty"`
}

type confluxAPICustomer struct {
	ID          string `json:"id,omitempty"`
	Email       string `json:"email,omitempty"`
	Name        string `json:"name,omitempty"`
	Phone       string `json:"phone,omitempty"`
	Description string `json:"description,omitempty"`
}

type confluxAPIBillingInfo struct {
	FirstName    string `json:"first_name,omitempty"`
	LastName     string `json:"last_name,omitempty"`
	Email        string `json:"email,omitempty"`
	Phone        string `json:"phone,omitempty"`
	Country      string `json:"country,omitempty"`
	State        string `json:"state,omitempty"`
	City         string `json:"city,omitempty"`
	AddressLine1 string `json:"address_line1,omitempty"`
	AddressLine2 string `json:"address_line2,omitempty"`
	PostalCode   string `json:"postal_code,omitempty"`
}

type confluxAPIShippingInfo struct {
	FirstName    string `json:"first_name,omitempty"`
	LastName     string `json:"last_name,omitempty"`
	Email        string `json:"email,omitempty"`
	Phone        string `json:"phone,omitempty"`
	Country      string `json:"country,omitempty"`
	State        string `json:"state,omitempty"`
	City         string `json:"city,omitempty"`
	AddressLine1 string `json:"address_line1,omitempty"`
	AddressLine2 string `json:"address_line2,omitempty"`
	PostalCode   string `json:"postal_code,omitempty"`
}

type confluxAPILineItem struct {
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
	Quantity    int64  `json:"quantity,omitempty"`
	UnitAmount  int64  `json:"unit_amount,omitempty"`
	Amount      int64  `json:"amount,omitempty"`
	Currency    string `json:"currency,omitempty"`
}

type confluxAPIDeviceInfo struct {
	ClientIP    string                `json:"client_ip"`
	BrowserInfo confluxAPIBrowserInfo `json:"browser_info"`
	Language    string                `json:"language"`
}

type confluxAPIBrowserInfo struct {
	UserAgent    string `json:"user_agent"`
	AcceptHeader string `json:"accept_header,omitempty"`
	Language     string `json:"language,omitempty"`
}

type confluxAPIResponse struct {
	Success bool                   `json:"success"`
	Code    string                 `json:"code"`
	Message string                 `json:"message"`
	Data    confluxAPIPaymentData  `json:"data"`
	RawData map[string]interface{} `json:"-"`
}

type confluxAPIPaymentData struct {
	MchOrderNo  string                 `json:"mch_order_no"`
	FlowOrderNo string                 `json:"flow_order_no"`
	TradeStatus string                 `json:"trade_status"`
	Amount      int64                  `json:"amount"`
	Currency    string                 `json:"currency"`
	CheckoutURL string                 `json:"checkout_url"`
	PaymentURL  string                 `json:"payment_url"`
	NextAction  confluxAPINextAction   `json:"next_action"`
	FailReason  string                 `json:"fail_reason"`
	RawData     map[string]interface{} `json:"-"`
}

type confluxAPINextAction struct {
	Type       string `json:"type"`
	URL        string `json:"url"`
	QRCode     string `json:"qr_code"`
	ExpireTime string `json:"expire_time"`
}

type confluxAPINotifyRequest struct {
	NotifyType string          `json:"notify_type"`
	NotifyID   string          `json:"notify_id"`
	Timestamp  int64           `json:"timestamp"`
	Nonce      string          `json:"nonce"`
	Sign       string          `json:"sign"`
	Data       json.RawMessage `json:"data"`
	DataRaw    string          `json:"data_raw"`
}

type confluxAPIPaymentNotifyData struct {
	MchOrderNo   string `json:"mch_order_no"`
	FlowOrderNo  string `json:"flow_order_no"`
	TradeStatus  string `json:"trade_status"`
	Amount       int64  `json:"amount"`
	Currency     string `json:"currency"`
	CompleteTime int64  `json:"complete_time"`
	FailReason   string `json:"fail_reason"`
}

func RequestConfluxAPIAmount(c *gin.Context) {
	var req ConfluxAPIPayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}

	if req.Amount < int64(setting.ConfluxAPIMinTopUp) {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", setting.ConfluxAPIMinTopUp)})
		return
	}

	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}

	payMoney := getConfluxAPIPayMoney(req.Amount, group)
	if payMoney < 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "success", "data": fmt.Sprintf("%.2f", payMoney)})
}

func RequestConfluxAPIPay(c *gin.Context) {
	if !setting.ConfluxAPIEnabled {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "Conflux 支付未启用"})
		return
	}
	if !isConfluxAPITopUpEnabled() {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "Conflux 配置不完整"})
		return
	}

	var req ConfluxAPIPayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	if req.Amount < int64(setting.ConfluxAPIMinTopUp) {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", setting.ConfluxAPIMinTopUp)})
		return
	}

	id := c.GetInt("id")
	user, err := model.GetUserById(id, false)
	if err != nil || user == nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "用户不存在"})
		return
	}

	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}

	payMoney := getConfluxAPIPayMoney(req.Amount, group)
	if payMoney < 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}

	tradeNo := fmt.Sprintf("CONFLUXAPI-%d-%d-%s", id, time.Now().UnixMilli(), randstr.String(6))
	topUp := &model.TopUp{
		UserId:          id,
		Amount:          normalizeConfluxAPITopUpAmount(req.Amount),
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodConfluxAPI,
		PaymentProvider: model.PaymentProviderConfluxAPI,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("ConfluxAPI 创建充值订单失败 user_id=%d trade_no=%s amount=%d error=%q", id, tradeNo, req.Amount, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}

	notifyURL, err := getConfluxAPINotifyURL()
	if err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("ConfluxAPI 异步通知地址未配置 user_id=%d trade_no=%s error=%q", id, tradeNo, err.Error()))
		topUp.Status = common.TopUpStatusFailed
		_ = topUp.Update()
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "异步通知地址未配置"})
		return
	}
	returnURL := firstNonEmpty(strings.TrimSpace(setting.ConfluxAPIReturnURL), paymentReturnPath("/payment/success"))
	cancelURL := firstNonEmpty(strings.TrimSpace(setting.ConfluxAPICancelURL), paymentReturnPath("/console/topup"))
	formattedAmount := formatConfluxAPIAmount(payMoney, getConfluxAPICurrency())
	paymentReq := confluxAPICreatePaymentRequest{
		MchNo:       strings.TrimSpace(setting.ConfluxAPIMchNo),
		GatewayNo:   strings.TrimSpace(setting.ConfluxAPIGatewayNo),
		MchOrderNo:  tradeNo,
		Amount:      formattedAmount,
		Currency:    getConfluxAPICurrency(),
		ReturnURL:   returnURL,
		CancelURL:   cancelURL,
		NotifyURL:   notifyURL,
		Description: fmt.Sprintf("Top up %d quota", req.Amount),
		Locale:      getConfluxAPILanguage(c),
		Customer: &confluxAPICustomer{
			ID:    fmt.Sprintf("user_%d", id),
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
				Name:       "Top up",
				Quantity:   1,
				UnitAmount: formattedAmount,
				Amount:     formattedAmount,
				Currency:   getConfluxAPICurrency(),
			},
		},
		CustomParams: map[string]any{
			"user_id": id,
		},
	}

	paymentResp, err := createConfluxAPIPayment(paymentReq)
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("ConfluxAPI 创建支付订单失败 user_id=%d trade_no=%s error=%q", id, tradeNo, err.Error()))
		topUp.Status = common.TopUpStatusFailed
		_ = topUp.Update()
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}

	if !paymentResp.Success || paymentResp.Code != "0000" {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("ConfluxAPI 创建支付订单业务失败 user_id=%d trade_no=%s code=%s message=%q", id, tradeNo, paymentResp.Code, paymentResp.Message))
		topUp.Status = common.TopUpStatusFailed
		_ = topUp.Update()
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": firstNonEmpty(paymentResp.Message, "拉起支付失败")})
		return
	}

	if strings.EqualFold(paymentResp.Data.TradeStatus, "FAILED") {
		topUp.Status = common.TopUpStatusFailed
		_ = topUp.Update()
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": firstNonEmpty(paymentResp.Data.FailReason, "拉起支付失败")})
		return
	}

	paymentURL := firstNonEmpty(paymentResp.Data.CheckoutURL, paymentResp.Data.PaymentURL, paymentResp.Data.NextAction.URL, paymentResp.Data.NextAction.QRCode)
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("ConfluxAPI 充值收银台创建成功 user_id=%d trade_no=%s flow_order_no=%s amount=%d money=%.2f gateway_no=%s", id, tradeNo, paymentResp.Data.FlowOrderNo, req.Amount, payMoney, paymentReq.GatewayNo))
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

func ConfluxAPINotify(c *gin.Context) {
	if !isConfluxAPIWebhookEnabled() {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("ConfluxAPI webhook 被拒绝 reason=webhook_disabled path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		c.String(http.StatusForbidden, "fail")
		return
	}

	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("ConfluxAPI webhook 读取请求体失败 path=%q client_ip=%s error=%q", c.Request.RequestURI, c.ClientIP(), err.Error()))
		c.String(http.StatusBadRequest, "fail")
		return
	}

	var notifyReq confluxAPINotifyRequest
	if err := common.Unmarshal(bodyBytes, &notifyReq); err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("ConfluxAPI webhook 解析失败 path=%q client_ip=%s error=%q body=%q", c.Request.RequestURI, c.ClientIP(), err.Error(), string(bodyBytes)))
		c.String(http.StatusBadRequest, "fail")
		return
	}

	if !verifyConfluxAPINotifySign(notifyReq) {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("ConfluxAPI webhook 验签失败 notify_id=%s path=%q client_ip=%s body=%q", notifyReq.NotifyID, c.Request.RequestURI, c.ClientIP(), string(bodyBytes)))
		c.String(http.StatusUnauthorized, "fail")
		return
	}

	if notifyReq.NotifyType != "PAYMENT" {
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("ConfluxAPI webhook 忽略事件 notify_type=%s notify_id=%s client_ip=%s", notifyReq.NotifyType, notifyReq.NotifyID, c.ClientIP()))
		c.String(http.StatusOK, "success")
		return
	}

	var paymentData confluxAPIPaymentNotifyData
	dataRaw := notifyReq.DataRaw
	if strings.TrimSpace(dataRaw) != "" {
		err = common.UnmarshalJsonStr(dataRaw, &paymentData)
	} else {
		err = common.Unmarshal(notifyReq.Data, &paymentData)
	}
	if err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("ConfluxAPI webhook 支付数据解析失败 notify_id=%s client_ip=%s error=%q", notifyReq.NotifyID, c.ClientIP(), err.Error()))
		c.String(http.StatusBadRequest, "fail")
		return
	}

	if paymentData.MchOrderNo == "" {
		c.String(http.StatusBadRequest, "fail")
		return
	}

	isCardShopOrder := strings.HasPrefix(paymentData.MchOrderNo, model.CardShopTradeNoPrefix)
	isSubscriptionOrder := strings.HasPrefix(paymentData.MchOrderNo, model.SubscriptionConfluxAPITradeNoPrefix)
	// Subscriptions, like card delivery, are higher-value irreversible actions:
	// reject stale/unidentified notifies. The DB transaction in
	// CompleteSubscriptionOrder is idempotent, so no in-memory replay set is needed.
	if isSubscriptionOrder {
		if !isConfluxAPINotifyFresh(notifyReq.Timestamp) || strings.TrimSpace(notifyReq.NotifyID) == "" {
			c.String(http.StatusUnauthorized, "fail")
			return
		}
	}
	cardShopReplayKey := ""
	cardShopProcessed := false
	if isCardShopOrder {
		if !isConfluxAPINotifyFresh(notifyReq.Timestamp) || strings.TrimSpace(notifyReq.NotifyID) == "" {
			c.String(http.StatusUnauthorized, "fail")
			return
		}
		cleanupConfluxAPICardShopNotifyReplay(common.GetTimestamp())
		cardShopReplayKey = paymentData.MchOrderNo + ":" + notifyReq.NotifyID
		if _, loaded := processedConfluxAPICardShopNotifyIDs.LoadOrStore(cardShopReplayKey, common.GetTimestamp()); loaded {
			logger.LogInfo(c.Request.Context(), fmt.Sprintf("ConfluxAPI cardshop webhook replay ignored trade_no=%s notify_id=%s", paymentData.MchOrderNo, notifyReq.NotifyID))
			c.String(http.StatusOK, "success")
			return
		}
		defer func() {
			if !cardShopProcessed && cardShopReplayKey != "" {
				processedConfluxAPICardShopNotifyIDs.Delete(cardShopReplayKey)
			}
		}()
	}

	LockOrder(paymentData.MchOrderNo)
	defer UnlockOrder(paymentData.MchOrderNo)

	switch strings.ToUpper(strings.TrimSpace(paymentData.TradeStatus)) {
	case "SUCCESS":
		if isCardShopOrder {
			if err := model.CompleteCardOrderPaymentAndDeliver(
				paymentData.MchOrderNo,
				paymentData.Amount,
				paymentData.Currency,
				paymentData.FlowOrderNo,
			); err != nil {
				logger.LogError(c.Request.Context(), fmt.Sprintf("ConfluxAPI 卡密订单自动发卡失败 trade_no=%s notify_id=%s client_ip=%s error=%q", paymentData.MchOrderNo, notifyReq.NotifyID, c.ClientIP(), err.Error()))
				c.String(http.StatusInternalServerError, "fail")
				return
			}
			cardShopProcessed = true
			break
		}
		if isSubscriptionOrder {
			if err := model.CompleteSubscriptionOrder(paymentData.MchOrderNo, dataRaw, model.PaymentProviderConfluxAPI, model.PaymentMethodConfluxAPI); err != nil {
				logger.LogError(c.Request.Context(), fmt.Sprintf("ConfluxAPI 订阅订单处理失败 trade_no=%s notify_id=%s client_ip=%s error=%q", paymentData.MchOrderNo, notifyReq.NotifyID, c.ClientIP(), err.Error()))
				c.String(http.StatusInternalServerError, "fail")
				return
			}
			logger.LogInfo(c.Request.Context(), fmt.Sprintf("ConfluxAPI 订阅订单处理成功 trade_no=%s notify_id=%s", paymentData.MchOrderNo, notifyReq.NotifyID))
			break
		}
		if err := model.RechargeConfluxAPI(paymentData.MchOrderNo, c.ClientIP()); err != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("ConfluxAPI 充值处理失败 trade_no=%s notify_id=%s client_ip=%s error=%q", paymentData.MchOrderNo, notifyReq.NotifyID, c.ClientIP(), err.Error()))
			c.String(http.StatusInternalServerError, "fail")
			return
		}
	case "FAILED":
		if isCardShopOrder {
			if err := model.MarkOrderFailed(paymentData.MchOrderNo); err != nil {
				logger.LogError(c.Request.Context(), fmt.Sprintf("ConfluxAPI 标记卡密订单失败 trade_no=%s notify_id=%s error=%q", paymentData.MchOrderNo, notifyReq.NotifyID, err.Error()))
				c.String(http.StatusInternalServerError, "fail")
				return
			}
			cardShopProcessed = true
			break
		}
		if isSubscriptionOrder {
			if err := model.ExpireSubscriptionOrder(paymentData.MchOrderNo, model.PaymentProviderConfluxAPI); err != nil &&
				err != model.ErrPaymentMethodMismatch && err != model.ErrSubscriptionOrderNotFound {
				logger.LogError(c.Request.Context(), fmt.Sprintf("ConfluxAPI 标记失败订阅订单失败 trade_no=%s notify_id=%s error=%q", paymentData.MchOrderNo, notifyReq.NotifyID, err.Error()))
				c.String(http.StatusInternalServerError, "fail")
				return
			}
			break
		}
		if err := model.UpdatePendingTopUpStatus(paymentData.MchOrderNo, model.PaymentProviderConfluxAPI, common.TopUpStatusFailed); err != nil &&
			err != model.ErrPaymentMethodMismatch {
			logger.LogError(c.Request.Context(), fmt.Sprintf("ConfluxAPI 标记失败订单状态失败 trade_no=%s notify_id=%s error=%q", paymentData.MchOrderNo, notifyReq.NotifyID, err.Error()))
			c.String(http.StatusInternalServerError, "fail")
			return
		}
	default:
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("ConfluxAPI webhook 订单状态非终态，忽略 trade_no=%s trade_status=%s notify_id=%s", paymentData.MchOrderNo, paymentData.TradeStatus, notifyReq.NotifyID))
		cardShopProcessed = isCardShopOrder
	}

	c.String(http.StatusOK, "success")
}

func createConfluxAPIPayment(req confluxAPICreatePaymentRequest) (*confluxAPIResponse, error) {
	bodyBytes, err := common.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequest(http.MethodPost, getConfluxAPIBaseURL()+confluxAPICheckoutCreatePath, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}

	timestamp := fmt.Sprintf("%d", time.Now().UnixMilli())
	nonce := randstr.String(24)
	signature := signConfluxAPIRequest(timestamp, nonce, string(bodyBytes))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-App-Id", strings.TrimSpace(setting.ConfluxAPIAppID))
	httpReq.Header.Set("X-Timestamp", timestamp)
	httpReq.Header.Set("X-Nonce", nonce)
	httpReq.Header.Set("X-Signature", signature)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, string(respBody))
	}

	var apiResp confluxAPIResponse
	if err := common.Unmarshal(respBody, &apiResp); err != nil {
		return nil, err
	}
	return &apiResp, nil
}

func getConfluxAPINotifyURL() (string, error) {
	notifyURL := strings.TrimSpace(setting.ConfluxAPINotifyURL)
	if notifyURL != "" {
		return notifyURL, nil
	}

	callbackAddress := strings.TrimRight(strings.TrimSpace(service.GetCallbackAddress()), "/")
	if callbackAddress == "" {
		return "", fmt.Errorf("callback address is empty")
	}
	return callbackAddress + "/api/confluxapi/notify", nil
}

func getConfluxAPIPayMoney(amount int64, group string) float64 {
	dAmount := decimal.NewFromInt(amount)
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dAmount = dAmount.Div(decimal.NewFromFloat(common.QuotaPerUnit))
	}

	topupGroupRatio := common.GetTopupGroupRatio(group)
	if topupGroupRatio == 0 {
		topupGroupRatio = 1
	}

	discount := 1.0
	if ds, ok := operation_setting.GetPaymentSetting().AmountDiscount[int(amount)]; ok && ds > 0 {
		discount = ds
	}

	payMoney := dAmount.
		Mul(decimal.NewFromFloat(operation_setting.Price)).
		Mul(decimal.NewFromFloat(topupGroupRatio)).
		Mul(decimal.NewFromFloat(discount))

	return payMoney.InexactFloat64()
}

func normalizeConfluxAPITopUpAmount(amount int64) int64 {
	if operation_setting.GetQuotaDisplayType() != operation_setting.QuotaDisplayTypeTokens {
		return amount
	}

	normalized := decimal.NewFromInt(amount).
		Div(decimal.NewFromFloat(common.QuotaPerUnit)).
		IntPart()
	if normalized < 1 {
		return 1
	}
	return normalized
}

func formatConfluxAPIAmount(payMoney float64, currency string) int64 {
	minorUnit := int32(2)
	switch strings.ToUpper(strings.TrimSpace(currency)) {
	case "JPY", "KRW":
		minorUnit = 0
	}
	return decimal.NewFromFloat(payMoney).Mul(decimal.New(1, minorUnit)).Round(0).IntPart()
}

func getConfluxAPIBaseURL() string {
	return strings.TrimRight(strings.TrimSpace(setting.ConfluxAPIBaseURL), "/")
}

func getConfluxAPICurrency() string {
	currency := strings.ToUpper(strings.TrimSpace(setting.ConfluxAPICurrency))
	if currency == "" {
		return "USD"
	}
	return currency
}

func getConfluxAPIClientIP(c *gin.Context) string {
	clientIP := strings.TrimSpace(c.ClientIP())
	if clientIP == "" {
		clientIP = strings.TrimSpace(c.GetHeader("X-Forwarded-For"))
	}
	if clientIP == "" {
		clientIP = strings.TrimSpace(c.GetHeader("X-Real-IP"))
	}
	if clientIP == "" {
		return "127.0.0.1"
	}
	if commaIndex := strings.Index(clientIP, ","); commaIndex >= 0 {
		clientIP = strings.TrimSpace(clientIP[:commaIndex])
	}
	return clientIP
}

func getConfluxAPIBrowserInfo(c *gin.Context) confluxAPIBrowserInfo {
	browserInfo := strings.TrimSpace(c.Request.UserAgent())
	if browserInfo == "" {
		browserInfo = "unknown"
	}
	return confluxAPIBrowserInfo{
		UserAgent:    browserInfo,
		AcceptHeader: strings.TrimSpace(c.GetHeader("Accept")),
		Language:     getConfluxAPILanguage(c),
	}
}

func getConfluxAPILanguage(c *gin.Context) string {
	language := strings.TrimSpace(c.GetHeader("Accept-Language"))
	if language == "" {
		return "en-US"
	}
	if commaIndex := strings.Index(language, ","); commaIndex >= 0 {
		language = strings.TrimSpace(language[:commaIndex])
	}
	return language
}

func signConfluxAPIRequest(timestamp string, nonce string, body string) string {
	signContent := strings.TrimSpace(setting.ConfluxAPIAppID) + timestamp + nonce + body
	mac := hmac.New(sha256.New, []byte(setting.ConfluxAPIAppSecret))
	mac.Write([]byte(signContent))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func verifyConfluxAPINotifySign(req confluxAPINotifyRequest) bool {
	if req.Sign == "" || req.Timestamp == 0 || req.Nonce == "" {
		return false
	}
	dataRaw := req.DataRaw
	if strings.TrimSpace(dataRaw) == "" && len(req.Data) > 0 {
		dataRaw = string(req.Data)
	}
	signContent := fmt.Sprintf("%d%s%s", req.Timestamp, req.Nonce, dataRaw)
	mac := hmac.New(sha256.New, []byte(setting.ConfluxAPIAppSecret))
	mac.Write([]byte(signContent))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(strings.ToLower(expected)), []byte(strings.ToLower(req.Sign)))
}

func isConfluxAPINotifyFresh(timestamp int64) bool {
	if timestamp <= 0 {
		return false
	}
	eventSeconds := timestamp
	if eventSeconds > 1000000000000 {
		eventSeconds = eventSeconds / 1000
	}
	now := common.GetTimestamp()
	age := now - eventSeconds
	if age < 0 {
		age = -age
	}
	return age <= confluxAPICardShopWebhookMaxAgeSeconds
}

func cleanupConfluxAPICardShopNotifyReplay(now int64) {
	processedConfluxAPICardShopNotifyIDs.Range(func(key, value any) bool {
		if ts, ok := value.(int64); ok && now-ts > confluxAPICardShopWebhookMaxAgeSeconds*2 {
			processedConfluxAPICardShopNotifyIDs.Delete(key)
		}
		return true
	})
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
