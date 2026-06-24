
export const ORDER_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const

export const DEFAULT_PAGE_SIZE = 10

// 支付成功页定位订单的兜底键：下单跳转去网关前写入，网关回跳若丢失 order_id query 仍可据此恢复。
export const LAST_ORDER_STORAGE_KEY = 'cardshop:lastOrderId'
